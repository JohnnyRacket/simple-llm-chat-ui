"use client";

import { AlertCircle, ChevronDown, ChevronUp, Globe, Loader2 } from "lucide-react";
import { useState } from "react";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type SearchResult = { title: string; url: string; snippet: string };
type SearchOutput = { results: SearchResult[] };
type FetchOutput = { title: string; content: string };

function SearchResults({ output }: { output: SearchOutput }) {
  return (
    <ol className="space-y-2 text-xs">
      {output.results.map((r, i) => (
        <li key={i} className="space-y-0.5">
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 dark:text-blue-400 hover:underline block truncate"
          >
            {r.title}
          </a>
          <p className="text-muted-foreground/80 truncate">{r.url}</p>
          {r.snippet && <p className="text-muted-foreground">{r.snippet}</p>}
        </li>
      ))}
    </ol>
  );
}

function PageContent({ output }: { output: FetchOutput }) {
  return (
    <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono">
      {output.content.trim()}
    </pre>
  );
}

export function ToolCallPart({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const isPending = part.state === "input-streaming" || part.state === "input-available";
  const isError = part.state === "output-error";
  const isDone = part.state === "output-available";
  const toolName = part.type.replace(/^tool-/, "");

  let label: string;
  if (toolName === "webSearch") {
    const q = (part.input as { query?: string } | undefined)?.query;
    label = q ? `Search: ${q}` : "Searching…";
  } else if (toolName === "fetchPage") {
    const u = (part.input as { url?: string } | undefined)?.url;
    label = u ? `Read: ${u}` : "Reading page…";
  } else {
    label = toolName;
  }

  return (
    <div className="my-1 rounded-md border border-foreground/10 bg-background/50 text-foreground">
      <button
        type="button"
        onClick={() => isDone && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-md ${isDone ? "hover:bg-foreground/5 cursor-pointer" : "cursor-default"}`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 opacity-70 animate-spin" />
        ) : isError ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className="flex-1 truncate font-medium opacity-90">{label}</span>
        {isDone && (
          expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          )
        )}
        {isError && <span className="text-xs text-destructive">failed</span>}
      </button>

      {expanded && isDone && (
        <div className="border-t border-foreground/10 px-3 py-2">
          {toolName === "webSearch" ? (
            <SearchResults output={part.output as SearchOutput} />
          ) : toolName === "fetchPage" ? (
            <PageContent output={part.output as FetchOutput} />
          ) : (
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
        </div>
      )}

      {isError && (
        <div className="border-t border-foreground/10 px-3 py-2">
          <p className="text-xs text-destructive">{part.errorText ?? "Tool call failed"}</p>
        </div>
      )}
    </div>
  );
}
