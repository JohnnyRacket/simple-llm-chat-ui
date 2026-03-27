import { tool } from "ai";
import { z } from "zod";

const inputSchema = z.object({
  query: z.string().min(1).max(400).describe("The search query"),
});

export const webSearch = tool({
  description:
    "Search the web for current information. Returns titles, URLs, and text snippets. " +
    "Use this when you need up-to-date facts or information from the internet.",
  inputSchema,
  execute: async (input: z.infer<typeof inputSchema>) => {
    console.log("[webSearch] query:", input.query);

    const url = new URL("http://portainer.localdomain:8181/search");
    url.searchParams.set("q", input.query);
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const data = await res.json() as {
      results: Array<{ title: string; url: string; content?: string }>;
    };

    const results = data.results.slice(0, 8).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? "",
    }));

    console.log("[webSearch] results:", results.length);
    return { results };
  },
});
