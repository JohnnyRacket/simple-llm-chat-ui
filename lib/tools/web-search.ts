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

    // DDG Lite accepts POST with form data and returns simple HTML
    const body = new URLSearchParams({ q: input.query, kl: "us-en" });
    const res = await fetch("https://lite.duckduckgo.com/lite/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const html = await res.text();
    console.log("[webSearch] html length:", html.length);

    // DDG Lite structure:
    //   <a class="result-link" href="URL">Title</a>
    //   <td class="result-snippet">Snippet</td>
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    const linkRe = /<a[^>]+href="([^"]+)"[^>]+class='result-link'[^>]*>(.*?)<\/a>/gi;
    const snippetRe = /<td class='result-snippet'[^>]*>([\s\S]*?)<\/td>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const url = m[1].trim();
      const title = m[2].replace(/<[^>]+>/g, "").trim();
      if (url.startsWith("http") && title) links.push({ url, title });
    }

    const snippets: string[] = [];
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
    }

    for (let i = 0; i < Math.min(links.length, 8); i++) {
      results.push({ ...links[i], snippet: snippets[i] ?? "" });
    }

    console.log("[webSearch] results:", results.length);
    return { results };
  },
});
