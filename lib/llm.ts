import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { SharedV3ProviderMetadata } from "@ai-sdk/provider";

export const BASE_HOST = "http://192.168.1.168";

export function createLLM(port: string) {
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
