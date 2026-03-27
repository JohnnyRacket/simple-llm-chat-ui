import { tool } from "ai";
import { z } from "zod";

const MAX_CHARS = 12_000;

const inputSchema = z.object({
  url: z.string().url().describe("Full URL of the webpage to fetch"),
});

function htmlToText(html: string): string {
  // Remove script/style/nav blocks entirely
  let text = html.replace(/<(script|style|nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Replace block-level tags with newlines
  text = text.replace(/<(p|div|h[1-6]|li|br|tr)[^>]*>/gi, "\n");
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Collapse excess whitespace
  text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

export const fetchPage = tool({
  description:
    "Retrieve and read the text content of a specific webpage. Use this to read the " +
    "full content of a URL from search results or one the user mentions.",
  inputSchema,
  execute: async (input: z.infer<typeof inputSchema>) => {
    console.log("[fetchPage] url:", input.url);
    const res = await fetch(input.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot/1.0)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/<[^>]+>/g, "").trim() ?? input.url;
    const content = htmlToText(html).slice(0, MAX_CHARS);
    console.log("[fetchPage] title:", title, "| chars:", content.length);
    return { title, content };
  },
});
