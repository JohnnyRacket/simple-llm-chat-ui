import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { SharedV3ProviderMetadata } from "@ai-sdk/provider";

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

export async function POST(req: Request) {
  const { messages, port = "8080" }: { messages: UIMessage[]; port?: string } = await req.json();

  const llm = createLLM(port);

  const result = streamText({
    model: llm("model"),
    messages: await convertToModelMessages(messages),
  });

  let timings: Record<string, number> | null = null;

  return result.toUIMessageStreamResponse({
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
  });
}
