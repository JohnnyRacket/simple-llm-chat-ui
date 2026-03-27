import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
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
import { webSearch, fetchPage, createSubAgentTool, createParallelAgentsTool, createDocument, executeCode, renderWidget } from "@/lib/tools";
import { createLLM } from "@/lib/llm";
import { errorDetails, errorMessage, logDebug, previewValue } from "@/lib/debug-chat-stream";
import { repairParentAgentToolCall } from "@/lib/tools/parent-agent-tool-repair";

function generateTitle(text: string): string {
  const max = 50;
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

function isTransientToolInputParseError(errorText: string) {
  return /Failed to parse input at pos \d+:/i.test(errorText);
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
    enableProgrammatic = false,
    enableWidget = false,
  }: { id?: string; message: UIMessage; port?: string; enableTools?: boolean; enableAgents?: boolean; agentPort?: string; enableReasoning?: boolean; enableCreateDocument?: boolean; enableProgrammatic?: boolean; enableWidget?: boolean } = await req.json();

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
  if (enableProgrammatic) {
    tools.executeCode = executeCode;
  }
  if (enableWidget) {
    tools.renderWidget = renderWidget;
  }
  const hasTools = Object.keys(tools).length > 0;
  logDebug("[chat-stream]", "POST start", {
    chatId: resolvedChatId,
    port: resolvedPort,
    agentPort: resolvedAgentPort,
    enableTools,
    enableAgents,
    enableReasoning,
    enableCreateDocument,
    enableProgrammatic,
    enableWidget,
    hasTools,
  });

  const agentSystem =
    "You are an orchestrating AI assistant. You delegate work to sub-agents rather than answering directly.\n\n" +
    "You have two agent tools:\n" +
    "- subAgent: for a single focused task\n" +
    "- parallelAgents: for multiple parallel tasks (pass an array of agents, all run simultaneously)\n\n" +
    "RULES:\n" +
    "1. When asked to research, analyze, or investigate multiple distinct things, ALWAYS use parallelAgents — one entry per thing.\n" +
    "2. When the request is vague or the best paths are unclear: first call subAgent with a task that asks for a short numbered research plan. Then in the next step call parallelAgents with one agent per direction from the plan.\n" +
    "3. Use subAgent only when there is genuinely a single focused task.\n" +
    "4. Keep agent usage minimal. Prefer one agent call unless the user clearly needs multiple independent investigations.\n" +
    "5. After all agents return, immediately synthesize their findings into a concise final response.\n" +
    "6. Do not continue reasoning at length after tool results. Do not call more tools after agents return unless the user explicitly requires another step.\n" +
    "7. Keep the final answer short and directly useful. Avoid repeating the full sub-agent output.\n" +
    "8. Never answer from your own knowledge — always delegate first.";

  const webToolSystem =
    `You are a helpful assistant with access to ${[
      enableTools ? "web search and page reading tools" : null,
      enableProgrammatic ? "a sandboxed code execution environment (Python, JavaScript, Bash)" : null,
      enableCreateDocument ? "document creation" : null,
      enableWidget ? "an interactive widget renderer" : null,
    ].filter(Boolean).join(", ")}. ` +
    "When you use a tool, always read the results carefully and then provide a thorough answer to the user based on what you found. " +
    "When researching factual claims, always fetch and cross-reference at least 2-3 independent sources before answering — do not rely on a single page. If sources conflict, note the disagreement. " +
    (enableCreateDocument
      ? "When asked to produce a report, document, or written artifact, use the createDocument tool with the full markdown content, then follow up with a brief high-level summary. "
      : "") +
    (enableProgrammatic
      ? "When asked to compute, calculate, or process data, prefer using the executeCode tool. " +
        "CRITICAL: When the conversation contains document or file content (e.g. a PDF or pasted text) that you need to process with code, " +
        "always pass that content as the inputData parameter — it will be available at /data/input.txt inside the container. " +
        "Never try to open a file by its original name and never embed large text strings directly into the code. "
      : "") +
    (enableWidget
      ? "When a visual or interactive component would help the user — such as a chart, calculator, data table, timeline, or game — use the renderWidget tool. " +
        "Produce a complete self-contained HTML document. " +
        "For React, use this exact pattern: import React and ALL hooks (useState, useEffect, etc.) from 'react'; import createRoot from 'react-dom/client'; never use ReactDOM.createRoot; never use JSX (no transpiler available) — use React.createElement() instead; no TypeScript. " +
        "After calling the tool, briefly describe what you built. "
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
    ...(hasTools
      ? {
          tools,
          stopWhen: stepCountIs(8),
          ...(enableAgents
            ? { experimental_repairToolCall: repairParentAgentToolCall }
            : {}),
        }
      : {}),
    experimental_onToolCallFinish(event) {
      logDebug("[chat-stream]", "toolCallFinish", {
        chatId: resolvedChatId,
        stepNumber: event.stepNumber,
        toolName: event.toolCall.toolName,
        toolCallId: event.toolCall.toolCallId,
        durationMs: event.durationMs,
        success: event.success,
        ...(event.success
          ? { output: previewValue(event.output) }
          : { error: errorDetails(event.error) }),
      });
    },
    onStepFinish(step) {
      logDebug("[chat-stream]", "stepFinish", {
        chatId: resolvedChatId,
        stepNumber: step.stepNumber,
        finishReason: step.finishReason,
        rawFinishReason: step.rawFinishReason,
        toolCalls: step.toolCalls.map((toolCall) => ({
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
        })),
        toolResultCount: step.toolResults.length,
        contentTypes: step.content.map((part) => part.type),
        textLength: step.text.length,
        reasoningLength: step.reasoningText?.length ?? 0,
      });
    },
    onError({ error }) {
      logDebug("[chat-stream]", "onError", {
        chatId: resolvedChatId,
        error: errorMessage(error),
        details: errorDetails(error),
      });
    },
    onAbort({ steps }) {
      logDebug("[chat-stream]", "onAbort", {
        chatId: resolvedChatId,
        finishedSteps: steps.length,
      });
    },
    async onFinish({ text, steps, usage, providerMetadata }) {
      logDebug("[chat-stream]", "onFinish", {
        chatId: resolvedChatId,
        steps: steps.length,
        textLength: text.length,
      });
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

  const uiMessageStream = result
    .toUIMessageStream({
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
    })
    .pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (
            chunk.type === "error" &&
            isTransientToolInputParseError(chunk.errorText)
          ) {
            logDebug("[chat-stream]", "suppress transient ui error", {
              chatId: resolvedChatId,
              error: chunk.errorText,
            });
            return;
          }

          controller.enqueue(chunk);
        },
      })
    );

  return createUIMessageStreamResponse({
    headers: {
      "X-Chat-Id": resolvedChatId,
      "Content-Encoding": "none",
      "Cache-Control": "no-cache, no-transform",
    },
    stream: uiMessageStream,
    consumeSseStream({ stream }) {
      const streamId = generateId();
      logDebug("[chat-stream]", "resumable register start", {
        chatId: resolvedChatId,
        streamId,
      });
      void streamContext.createNewResumableStream(streamId, () => stream).then(
        async () => {
          await setActiveStreamId(resolvedChatId, streamId);
          logDebug("[chat-stream]", "resumable register done", {
            chatId: resolvedChatId,
            streamId,
          });
        }
      );
    },
  });
}
