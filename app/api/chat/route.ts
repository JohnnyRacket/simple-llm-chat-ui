import {
  streamText,
  convertToModelMessages,
  generateId,
  wrapLanguageModel,
  extractReasoningMiddleware,
  stepCountIs,
  type UIMessage,
} from "ai";
import { getUser } from "@/lib/user";
import {
  createChatWithMessage,
  appendMessage,
  loadMessages,
  touchChat,
  setActiveStreamId,
  clearActiveStreamId,
  getChatPort,
} from "@/lib/db/chats";
import db from "@/lib/db";
import { streamContext } from "@/lib/stream";
import { registerAbort, removeAbort } from "@/lib/abort-registry";
import { webSearch, fetchPage, createSubAgentTool, createParallelAgentsTool, createDocument } from "@/lib/tools";
import { createLLM } from "@/lib/llm";

function generateTitle(text: string): string {
  const max = 50;
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export async function POST(req: Request) {
  const {
    id: incomingChatId,
    message,
    port = "8080",
    enableTools = false,
    enableAgents = false,
    agentPort,
    enableReasoning = false,
    enableCreateDocument = false,
  }: { id?: string; message: UIMessage; port?: string; enableTools?: boolean; enableAgents?: boolean; agentPort?: string; enableReasoning?: boolean; enableCreateDocument?: boolean } = await req.json();

  const user = await getUser();
  const userContent =
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";

  let resolvedChatId: string;
  let resolvedPort = port;

  if (incomingChatId) {
    // Validate ownership
    const chat = await db
      .selectFrom("chats")
      .select("id")
      .where("id", "=", incomingChatId)
      .where("user_id", "=", user.id)
      .executeTakeFirst();

    if (!chat) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    resolvedChatId = incomingChatId;
    resolvedPort = await getChatPort(incomingChatId, user.id);
    await appendMessage(resolvedChatId, "user", userContent);
  } else {
    const title = generateTitle(userContent);
    resolvedChatId = await createChatWithMessage(user.id, title, userContent, port);
  }

  // Load full conversation from DB for context
  const dbMessages = await loadMessages(resolvedChatId, user.id);
  const uiMessages: UIMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts,
    createdAt: m.createdAt,
  }));

  const llm = createLLM(resolvedPort);
  const baseModel = llm("model");
  const model = enableReasoning
    ? wrapLanguageModel({
        model: baseModel,
        middleware: extractReasoningMiddleware({ tagName: "think" }),
      })
    : baseModel;

  const resolvedAgentPort = agentPort ?? resolvedPort;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {};
  if (enableTools) {
    tools.webSearch = webSearch;
    tools.fetchPage = fetchPage;
    if (enableCreateDocument) {
      tools.createDocument = createDocument;
    }
  }
  if (enableAgents) {
    tools.subAgent = createSubAgentTool(resolvedAgentPort, enableTools);
    tools.parallelAgents = createParallelAgentsTool(resolvedAgentPort, enableTools);
  }
  const hasTools = Object.keys(tools).length > 0;

  const agentSystem =
    "You are an orchestrating AI assistant. You delegate work to sub-agents rather than answering directly.\n\n" +
    "You have two agent tools:\n" +
    "- subAgent: for a single focused task\n" +
    "- parallelAgents: for multiple parallel tasks (pass an array of agents, all run simultaneously)\n\n" +
    "RULES:\n" +
    "1. When asked to research, analyze, or investigate multiple distinct things, ALWAYS use parallelAgents — one entry per thing.\n" +
    "2. When the request is vague or the best paths are unclear: first call subAgent with role=planner to map out the research directions. Then in the next step call parallelAgents with one agent per direction from the plan.\n" +
    "3. Use subAgent only when there is genuinely a single focused task.\n" +
    "4. After all agents return, synthesize their findings into a coherent final response.\n" +
    "5. Never answer from your own knowledge — always delegate first.";

  const webToolSystem =
    `You are a helpful assistant with access to web search and page reading tools${enableCreateDocument ? ", and document creation" : ""}. ` +
    "When you use a tool, always read the results carefully and then provide a thorough answer to the user based on what you found. " +
    (enableCreateDocument
      ? "When asked to produce a report, document, or written artifact, use the createDocument tool with the full markdown content, then follow up with a brief high-level summary. "
      : "") +
    "Never stop after a tool call without giving a final response.";

  const toolSystem = enableAgents ? agentSystem : webToolSystem;

  const abortController = new AbortController();
  registerAbort(resolvedChatId, abortController);

  const result = streamText({
    model,
    abortSignal: abortController.signal,
    ...(hasTools ? { system: toolSystem } : {}),
    messages: await convertToModelMessages(uiMessages),
    ...(hasTools ? { tools, stopWhen: stepCountIs(8) } : {}),
    async onFinish({ text, steps, usage, providerMetadata }) {
      const t = (
        providerMetadata?.["local-llama"] as
          | Record<string, unknown>
          | undefined
      )?.timings as Record<string, number> | undefined;

      // Store per-step reasoning and tool calls so we can fully reconstruct
      // the conversation (reasoning → tool call → reasoning → final answer).
      const stepsData = steps
        .map((s) => ({
          reasoning: s.reasoningText || undefined,
          toolCalls: s.toolCalls.map((tc) => ({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: (tc as { input?: unknown }).input,
            result: s.toolResults.find(
              (tr) => tr.toolCallId === tc.toolCallId
            ),
          })),
        }))
        .filter((s) => s.reasoning || s.toolCalls.length > 0);

      const metadata = {
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          promptTps: t?.prompt_per_second ?? null,
          generationTps: t?.predicted_per_second ?? null,
          totalTimeMs: t
            ? (t.prompt_ms ?? 0) + (t.predicted_ms ?? 0)
            : null,
        },
        ...(stepsData.length > 0 ? { stepsData } : {}),
      };

      await appendMessage(resolvedChatId, "assistant", text, metadata);
      await clearActiveStreamId(resolvedChatId);
      await touchChat(resolvedChatId);
      removeAbort(resolvedChatId);
    },
  });

  let timings: Record<string, number> | null = null;

  return result.toUIMessageStreamResponse({
    headers: {
      "X-Chat-Id": resolvedChatId,
      "Content-Encoding": "none",
      "Cache-Control": "no-cache, no-transform",
    },
    generateMessageId: generateId,
    sendReasoning: enableReasoning,
    messageMetadata({ part }) {
      if (part.type === "finish-step") {
        const meta = (part as Record<string, unknown>).providerMetadata as
          | Record<string, Record<string, unknown>>
          | undefined;
        timings =
          (meta?.["local-llama"]?.timings as Record<string, number>) ?? null;
      }
      if (part.type === "finish") {
        return {
          usage: {
            inputTokens: part.totalUsage.inputTokens ?? 0,
            outputTokens: part.totalUsage.outputTokens ?? 0,
            promptTps: timings?.prompt_per_second ?? null,
            generationTps: timings?.predicted_per_second ?? null,
            totalTimeMs: timings
              ? (timings.prompt_ms ?? 0) + (timings.predicted_ms ?? 0)
              : null,
          },
        };
      }
    },
    async consumeSseStream({ stream }) {
      const streamId = generateId();
      await streamContext.createNewResumableStream(streamId, () => stream);
      await setActiveStreamId(resolvedChatId, streamId);
    },
  });
}
