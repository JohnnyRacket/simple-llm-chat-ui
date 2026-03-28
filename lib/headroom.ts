import { compress, type OpenAIMessage } from "headroom-ai";
import type { LanguageModelV3Middleware } from "@ai-sdk/provider";
import { logDebug, errorMessage, errorDetails } from "@/lib/debug-chat-stream";

const PREFIX = "[headroom]";

/** Tool names whose results should never be compressed (e.g. they contain URLs the LLM needs). */
const COMPRESSION_BLACKLIST = new Set(["webSearch"]);

function isVerbose() {
  return process.env.DEBUG_HEADROOM === "1";
}

export type CompressionStats = {
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  compressionRatio: number;
  transformsApplied: string[];
  durationMs: number;
};

let healthChecked = false;

async function checkProxyHealth(baseUrl: string) {
  if (healthChecked) return;
  healthChecked = true;
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    logDebug(PREFIX, "proxy:health", {
      status: res.status,
      ok: res.ok,
      baseUrl,
    });
  } catch (err) {
    logDebug(PREFIX, "proxy:health", {
      error: errorMessage(err),
      baseUrl,
      hint: "Is the headroom proxy running? Try: docker compose up headroom",
    });
  }
}

// ── V3 prompt ↔ OpenAI message format conversion ──
// The Vercel AI SDK internal format (LanguageModelV3Prompt) uses typed part arrays,
// while headroom expects OpenAI format with string content and tool_calls.

type V3Message = {
  role: string;
  content: string | V3Part[];
  providerOptions?: unknown;
};

type V3Part = {
  type: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  [key: string]: unknown;
};

/** Unwrap V3 typed output ({ type: 'text'|'json', value }) to a plain string for OpenAI format */
function unwrapV3Output(output: unknown): string {
  if (output && typeof output === "object" && "value" in output) {
    const typed = output as { type?: string; value?: unknown };
    if (typeof typed.value === "string") return typed.value;
    return JSON.stringify(typed.value);
  }
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}

function v3ToOpenAI(messages: V3Message[]): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const content = typeof msg.content === "string"
        ? msg.content
        : (msg.content as V3Part[]).filter(p => p.type === "text").map(p => p.text).join("\n");
      result.push({ role: "system", content });
      continue;
    }

    if (msg.role === "user") {
      const parts = Array.isArray(msg.content) ? msg.content as V3Part[] : [{ type: "text", text: msg.content as string }];
      const textContent = parts.filter(p => p.type === "text").map(p => p.text ?? "").join("\n");
      result.push({ role: "user", content: textContent });
      continue;
    }

    if (msg.role === "assistant") {
      const parts = Array.isArray(msg.content) ? msg.content as V3Part[] : [];
      const textParts = parts.filter(p => p.type === "text" || p.type === "reasoning");
      const toolCallParts = parts.filter(p => p.type === "tool-call");
      const toolResultParts = parts.filter(p => p.type === "tool-result");
      const toolErrorParts = parts.filter(p => p.type === "tool-error");

      const textContent = textParts.map(p => p.text ?? "").join("\n") || null;
      const toolCalls = toolCallParts.length > 0
        ? toolCallParts.map(tc => ({
            id: tc.toolCallId!,
            type: "function" as const,
            function: {
              name: tc.toolName!,
              arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
            },
          }))
        : undefined;

      result.push({ role: "assistant", content: textContent, ...(toolCalls ? { tool_calls: toolCalls } : {}) });

      // V3 puts tool results in a separate "tool" role message, but sometimes
      // they can appear inline in assistant content. Emit as separate tool messages.
      for (const tr of toolResultParts) {
        result.push({ role: "tool", content: unwrapV3Output(tr.output), tool_call_id: tr.toolCallId! });
      }
      // Tool errors must also be emitted as tool responses so every assistant
      // tool_call has a corresponding tool message (required by OpenAI format).
      for (const te of toolErrorParts) {
        const errorText = typeof te.error === "string" ? te.error
          : te.error && typeof te.error === "object" && "message" in te.error
            ? String((te.error as { message: unknown }).message)
            : JSON.stringify(te.error ?? "Tool call failed");
        result.push({ role: "tool", content: `Error: ${errorText}`, tool_call_id: te.toolCallId! });
      }
      continue;
    }

    if (msg.role === "tool") {
      const parts = Array.isArray(msg.content) ? msg.content as V3Part[] : [];
      for (const tr of parts) {
        if (tr.type === "tool-result") {
          result.push({ role: "tool", content: unwrapV3Output(tr.output), tool_call_id: tr.toolCallId! });
        } else if (tr.type === "tool-error") {
          const errorText = typeof tr.error === "string" ? tr.error
            : tr.error && typeof tr.error === "object" && "message" in tr.error
              ? String((tr.error as { message: unknown }).message)
              : JSON.stringify(tr.error ?? "Tool call failed");
          result.push({ role: "tool", content: `Error: ${errorText}`, tool_call_id: tr.toolCallId! });
        }
      }
      continue;
    }
  }

  return result;
}

/**
 * Splice compressed tool result content back into the original V3 messages.
 *
 * Strategy: build a map of toolCallId → compressed content from the OpenAI
 * compressed output. Then walk the original V3 messages and replace any
 * tool-result part whose toolCallId appears in the map.
 *
 * We ONLY touch tool-result outputs. System, user, and assistant text parts
 * are left as the original V3 — this avoids any structural mismatch since
 * headroom protects user messages and system messages are typically small.
 * Tool results are the primary compression target anyway.
 */
function spliceCompressedToolResults(compressed: OpenAIMessage[], original: V3Message[]): V3Message[] {
  // Build lookup: toolCallId → compressed content string
  const compressedToolContent = new Map<string, string>();
  for (const cm of compressed) {
    if (cm.role === "tool") {
      const toolCallId = (cm as { tool_call_id?: string }).tool_call_id;
      if (toolCallId) {
        compressedToolContent.set(toolCallId, typeof cm.content === "string" ? cm.content : JSON.stringify(cm.content));
      }
    }
  }

  if (compressedToolContent.size === 0) {
    logDebug(PREFIX, "splice:no-tool-results", { compressedMsgCount: compressed.length });
    return original;
  }

  logDebug(PREFIX, "splice:tool-results", {
    compressedToolCount: compressedToolContent.size,
    toolCallIds: [...compressedToolContent.keys()],
  });

  function replaceToolResultParts(parts: V3Part[]): V3Part[] {
    return parts.map(part => {
      if (part.type === "tool-result" && part.toolCallId) {
        if (part.toolName && COMPRESSION_BLACKLIST.has(part.toolName)) {
          if (isVerbose()) {
            logDebug(PREFIX, "splice:skip-blacklisted", {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
            });
          }
          return part;
        }
        const compressedContent = compressedToolContent.get(part.toolCallId);
        if (compressedContent !== undefined) {
          // V3 output is typed: { type: 'text', value: string } | { type: 'json', value: JSONValue }
          // Preserve the original output structure, only replace the value.
          const origOutput = part.output as { type?: string; value?: unknown } | undefined;
          let newOutput: unknown;
          if (origOutput && origOutput.type === "json") {
            // Try to parse compressed content back to JSON, fall back to text
            try {
              newOutput = { type: "json", value: JSON.parse(compressedContent) };
            } catch {
              newOutput = { type: "text", value: compressedContent };
            }
          } else {
            // Original was text or unknown — keep as text
            newOutput = { type: "text", value: compressedContent };
          }
          if (isVerbose()) {
            const origLen = JSON.stringify(origOutput?.value ?? "").length;
            const compLen = compressedContent.length;
            logDebug(PREFIX, "splice:replaced", {
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              origChars: origLen,
              compChars: compLen,
              outputType: (newOutput as { type: string }).type,
            });
          }
          return { ...part, output: newOutput };
        }
      }
      return part;
    });
  }

  return original.map(msg => {
    if (!Array.isArray(msg.content)) return msg;

    const parts = msg.content as V3Part[];
    const hasToolResults = parts.some(p => p.type === "tool-result" && p.toolCallId && compressedToolContent.has(p.toolCallId));
    if (!hasToolResults) return msg;

    return { ...msg, content: replaceToolResultParts(parts) };
  });
}

// ── Stats accumulator ──

export type StatsAccumulator = {
  totalTokensBefore: number;
  totalTokensAfter: number;
  totalTokensSaved: number;
  totalDurationMs: number;
  stepCount: number;
  transformsApplied: string[];
  lastStep: CompressionStats | null;
};

export function createStatsAccumulator(): StatsAccumulator {
  return {
    totalTokensBefore: 0,
    totalTokensAfter: 0,
    totalTokensSaved: 0,
    totalDurationMs: 0,
    stepCount: 0,
    transformsApplied: [],
    lastStep: null,
  };
}

export function getAccumulatedStats(acc: StatsAccumulator): CompressionStats | null {
  return acc.lastStep;
}

// ── Middleware ──

export function createHeadroomMiddleware(statsAccumulator: StatsAccumulator): LanguageModelV3Middleware {
  const baseUrl = process.env.HEADROOM_BASE_URL;
  const apiKey = process.env.HEADROOM_API_KEY || undefined;

  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      const prompt = params.prompt;
      if (!prompt || prompt.length === 0) return params;

      if (!baseUrl) {
        logDebug(PREFIX, "compress:skip", { reason: "HEADROOM_BASE_URL not set", step: statsAccumulator.stepCount });
        return params;
      }

      await checkProxyHealth(baseUrl);

      const stepNum = statsAccumulator.stepCount;
      logDebug(PREFIX, "compress:start", {
        step: stepNum,
        messageCount: prompt.length,
        baseUrl,
      });

      const startMs = performance.now();

      try {
        // Convert V3 internal format → OpenAI format that headroom understands
        const openaiMessages = v3ToOpenAI(prompt as unknown as V3Message[]);

        if (isVerbose()) {
          logDebug(PREFIX, "compress:converted", {
            step: stepNum,
            v3MessageCount: prompt.length,
            openaiMessageCount: openaiMessages.length,
            messages: openaiMessages.map((m, i) => ({
              i,
              role: m.role,
              contentLength: typeof m.content === "string" ? m.content?.length ?? 0 : JSON.stringify(m.content).length,
              contentPreview: typeof m.content === "string" ? m.content?.slice(0, 120) : JSON.stringify(m.content).slice(0, 120),
              ...(m.role === "assistant" && (m as unknown as Record<string, unknown>).tool_calls ? { toolCalls: ((m as unknown as Record<string, unknown>).tool_calls as unknown[]).length } : {}),
              ...(m.role === "tool" ? { toolCallId: (m as unknown as Record<string, unknown>).tool_call_id } : {}),
            })),
          });
        }

        const result = await compress(openaiMessages, {
          baseUrl,
          apiKey,
          timeout: 5000,
          fallback: true,
        });

        const durationMs = Math.round(performance.now() - startMs);

        if (!result.compressed || result.tokensSaved <= 0) {
          logDebug(PREFIX, "compress:no-savings", {
            step: stepNum,
            durationMs,
            tokensBefore: result.tokensBefore,
            tokensAfter: result.tokensAfter,
            compressed: result.compressed,
            transforms: result.transformsApplied,
          });
          return params;
        }

        // Splice only compressed tool result content back into original V3 structure.
        // This preserves all V3 metadata, reasoning parts, tool-call parts, etc.
        const compressedPrompt = spliceCompressedToolResults(
          result.messages as OpenAIMessage[],
          prompt as unknown as V3Message[]
        );

        const stepStats: CompressionStats = {
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          tokensSaved: result.tokensSaved,
          compressionRatio: result.compressionRatio,
          transformsApplied: result.transformsApplied,
          durationMs,
        };

        statsAccumulator.totalTokensBefore += result.tokensBefore;
        statsAccumulator.totalTokensAfter += result.tokensAfter;
        statsAccumulator.totalTokensSaved += result.tokensSaved;
        statsAccumulator.totalDurationMs += durationMs;
        statsAccumulator.stepCount += 1;
        statsAccumulator.transformsApplied.push(...result.transformsApplied);
        statsAccumulator.lastStep = stepStats;

        logDebug(PREFIX, "compress:done", {
          step: stepNum,
          tokensBefore: result.tokensBefore,
          tokensAfter: result.tokensAfter,
          tokensSaved: result.tokensSaved,
          compressionRatio: `${(result.compressionRatio * 100).toFixed(1)}%`,
          durationMs,
          transformsApplied: result.transformsApplied,
        });

        return { ...params, prompt: compressedPrompt as typeof params.prompt };
      } catch (err) {
        const durationMs = Math.round(performance.now() - startMs);
        logDebug(PREFIX, "compress:error", {
          step: stepNum,
          error: errorMessage(err),
          details: errorDetails(err),
          durationMs,
          hint: "Falling back to uncompressed messages",
        });
        return params;
      }
    },
  };
}
