import {
  streamText,
  convertToModelMessages,
  generateId,
  wrapLanguageModel,
  extractReasoningMiddleware,
  stepCountIs,
  type UIMessage,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { SharedV3ProviderMetadata } from "@ai-sdk/provider";
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
import { webSearch, fetchPage } from "@/lib/tools";

const BASE_HOST = "http://192.168.1.168";

function createLLM(port: string) {
  return createOpenAICompatible({
    name: "local-llama",
    baseURL: `${BASE_HOST}:${port}/v1`,
    apiKey: "not-needed",
    includeUsage: true,
    metadataExtractor: {
      extractMetadata: async ({ parsedBody }) => {
        const body = parsedBody as Record<string, unknown>;
        return body?.timings
          ? ({ "local-llama": { timings: body.timings } } as unknown as SharedV3ProviderMetadata)
          : undefined;
      },
      createStreamExtractor: () => {
        let timings: Record<string, number> | null = null;
        return {
          processChunk(chunk: unknown) {
            const c = chunk as Record<string, unknown>;
            if (c?.timings) timings = c.timings as Record<string, number>;
          },
          buildMetadata() {
            return timings
              ? ({ "local-llama": { timings } } as unknown as SharedV3ProviderMetadata)
              : undefined;
          },
        };
      },
    },
  });
}

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
    enableReasoning = false,
  }: { id?: string; message: UIMessage; port?: string; enableTools?: boolean; enableReasoning?: boolean } = await req.json();

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

  const toolSystem =
    "You are a helpful assistant with access to web search and page reading tools. " +
    "When you use a tool, always read the results carefully and then provide a thorough answer to the user based on what you found. " +
    "Never stop after a tool call without giving a final response.";

  const result = streamText({
    model,
    ...(enableTools ? { system: toolSystem } : {}),
    messages: await convertToModelMessages(uiMessages),
    ...(enableTools ? { tools: { webSearch, fetchPage }, stopWhen: stepCountIs(8) } : {}),
    async onFinish({ text, steps, usage, providerMetadata, reasoningText }) {
      const t = (
        providerMetadata?.["local-llama"] as
          | Record<string, unknown>
          | undefined
      )?.timings as Record<string, number> | undefined;

      const toolSteps =
        steps.length > 1
          ? steps.flatMap((s) =>
              s.toolCalls.map((tc) => ({
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: (tc as { input?: unknown }).input,
                result: s.toolResults.find(
                  (tr) => tr.toolCallId === tc.toolCallId
                ),
              }))
            )
          : undefined;

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
        ...(toolSteps ? { toolSteps } : {}),
        ...(reasoningText ? { reasoningText } : {}),
      };

      await appendMessage(resolvedChatId, "assistant", text, metadata);
      await clearActiveStreamId(resolvedChatId);
      await touchChat(resolvedChatId);
    },
  });

  let timings: Record<string, number> | null = null;

  return result.toUIMessageStreamResponse({
    headers: { "X-Chat-Id": resolvedChatId },
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
