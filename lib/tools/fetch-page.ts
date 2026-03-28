import { tool } from "ai";
import { z } from "zod";
import { parse, HTMLElement, Node, NodeType } from "node-html-parser";

const MAX_CHARS = 20_000;
const MAX_LINKS = 30;

const CONTENT_SELECTORS = [
  "main",
  "article",
  '[role="main"]',
  '[role="article"]',
  ".main-content",
  "#content",
  "#main",
];

const HEADING_LEVELS: Record<string, number> = {
  h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6,
};

const BLOCK_TAGS = new Set([
  "p", "div", "section", "blockquote", "figure", "figcaption",
  "dl", "dt", "dd",
]);

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLinks(doc: HTMLElement, baseUrl: string): { text: string; href: string }[] {
  const seen = new Set<string>();
  const links: { text: string; href: string }[] = [];

  for (const anchor of doc.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || /^(mailto|javascript|tel|data):/i.test(href)) continue;

    const resolved = resolveUrl(href, baseUrl);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);

    const text = anchor.text.replace(/\s+/g, " ").trim().slice(0, 80);
    links.push({ text: text || resolved, href: resolved });
    if (links.length >= MAX_LINKS) break;
  }

  return links;
}

function extractContentRoot(doc: HTMLElement): HTMLElement {
  for (const sel of CONTENT_SELECTORS) {
    const el = doc.querySelector(sel);
    if (el) return el as HTMLElement;
  }
  return (doc.querySelector("body") ?? doc) as HTMLElement;
}

function nodeToMarkdown(node: Node, baseUrl: string, inPre = false): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return node.rawText;
  }

  if (node.nodeType !== NodeType.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? "";

  // Skip elements with no text value for LLM
  if (["img", "video", "audio", "canvas", "map", "svg"].includes(tag)) return "";

  // Pre blocks: use raw text, don't recurse
  if (tag === "pre") {
    const codeEl = el.querySelector("code");
    const raw = (codeEl ?? el).rawText;
    return "```\n" + raw + "\n```\n";
  }

  // Recurse children
  const children = (el.childNodes ?? []) as Node[];

  // Lists: handle at container level for clean prefixes
  if (tag === "ul") {
    const items = children
      .filter((c) => (c as HTMLElement).tagName?.toLowerCase() === "li")
      .map((c) => "- " + nodeToMarkdown(c, baseUrl, inPre).trim())
      .join("\n");
    return "\n" + items + "\n";
  }

  if (tag === "ol") {
    const items = children
      .filter((c) => (c as HTMLElement).tagName?.toLowerCase() === "li")
      .map((c, i) => `${i + 1}. ` + nodeToMarkdown(c, baseUrl, inPre).trim())
      .join("\n");
    return "\n" + items + "\n";
  }

  // Tables
  if (tag === "table") {
    const rows: string[] = [];
    let inHead = false;
    for (const child of el.querySelectorAll("tr")) {
      const isHead = child.closest("thead") !== null;
      const cells = (child.childNodes as Node[])
        .filter((c) => {
          const t = (c as HTMLElement).tagName?.toLowerCase();
          return t === "td" || t === "th";
        })
        .map((c) => nodeToMarkdown(c, baseUrl, inPre).trim());
      rows.push("| " + cells.join(" | ") + " |");
      if (isHead && !inHead) {
        rows.push("| " + cells.map(() => "---").join(" | ") + " |");
        inHead = true;
      }
    }
    return "\n" + rows.join("\n") + "\n";
  }

  const inner = children.map((c) => nodeToMarkdown(c, baseUrl, inPre)).join("");

  // Headings
  if (tag in HEADING_LEVELS) {
    const level = HEADING_LEVELS[tag];
    const text = inner.replace(/\s+/g, " ").trim();
    return text ? "#".repeat(level) + " " + text + "\n\n" : "";
  }

  // Block elements
  if (BLOCK_TAGS.has(tag)) {
    return "\n\n" + inner + "\n\n";
  }

  // li (when reached directly, not via ul/ol handler)
  if (tag === "li") return inner;

  // Inline formatting
  if (tag === "strong" || tag === "b") {
    const text = inner.trim();
    return text ? "**" + text + "**" : "";
  }
  if (tag === "em" || tag === "i") {
    const text = inner.trim();
    return text ? "*" + text + "*" : "";
  }
  if (tag === "code" && !inPre) {
    return "`" + inner + "`";
  }

  // Links
  if (tag === "a") {
    const href = el.getAttribute("href") ?? "";
    const resolved = href ? resolveUrl(href, baseUrl) : null;
    const text = inner.trim();
    if (resolved && text && !href.startsWith("#")) {
      return "[" + text + "](" + resolved + ")";
    }
    return inner;
  }

  // Line break
  if (tag === "br") return "\n";

  // tr/td/th handled by table above; fall through transparently
  return inner;
}

function buildContent(root: HTMLElement, baseUrl: string): string {
  const raw = nodeToMarkdown(root, baseUrl);
  let content = raw.replace(/\n{3,}/g, "\n\n").trim();

  if (content.length > MAX_CHARS) {
    const slice = content.slice(0, MAX_CHARS);
    const lastBreak = slice.lastIndexOf("\n\n");
    content =
      lastBreak > MAX_CHARS * 0.5
        ? slice.slice(0, lastBreak) + "\n\n…[truncated]"
        : slice + "…[truncated]";
  }

  return content;
}

const inputSchema = z.object({
  url: z.string().url().describe("Full URL of the webpage to fetch"),
});

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
      redirect: "follow",
    });

    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

    const contentType = res.headers.get("content-type") ?? "";
    const finalUrl = res.url || input.url;

    if (!contentType.includes("text/html")) {
      if (contentType.startsWith("text/") || contentType.includes("markdown")) {
        const text = await res.text();
        return { title: input.url, content: text.slice(0, MAX_CHARS), links: [] };
      }
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    // Charset-aware decoding
    const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
    const charset = charsetMatch?.[1]?.toLowerCase() ?? "utf-8";
    let html: string;
    if (charset !== "utf-8" && charset !== "utf8") {
      const buffer = await res.arrayBuffer();
      try {
        html = new TextDecoder(charset).decode(buffer);
      } catch {
        html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      }
    } else {
      html = await res.text();
    }

    const doc = parse(html, {
      lowerCaseTagName: true,
      comment: false,
      fixNestedATags: true,
      parseNoneClosedTags: true,
    });

    // Extract title before any removal
    const titleEl = doc.querySelector("title");
    const title = titleEl?.text?.trim() ?? input.url;

    // Remove script/style noise first
    for (const sel of ["script", "style", "noscript", "iframe", "svg"]) {
      doc.querySelectorAll(sel).forEach((n) => n.remove());
    }

    // Extract links before removing nav/footer
    const links = extractLinks(doc, finalUrl);

    // Remove structural noise for content extraction
    for (const sel of ["nav", "header", "footer", "aside", "form"]) {
      doc.querySelectorAll(sel).forEach((n) => n.remove());
    }

    const root = extractContentRoot(doc);
    const content = buildContent(root, finalUrl);

    console.log("[fetchPage] title:", title, "| chars:", content.length, "| links:", links.length);
    return { title, content, links };
  },
});
