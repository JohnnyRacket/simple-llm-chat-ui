"use client";

import { AlertCircle, Bot, ChevronDown, ChevronUp, Download, FileText, Globe, Loader2 } from "lucide-react";
import { useState } from "react";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type SubAgentOutput = {
  role: string;
  task: string;
  result: string;
  steps: number;
  toolCallCount: number;
  error?: string;
};

type ParallelAgentsOutput = {
  agents: SubAgentOutput[];
};

function SubAgentResult({ output }: { output: SubAgentOutput }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>Role: <strong>{output.role}</strong></span>
        <span>Steps: {output.steps}</span>
        <span>Tool calls: {output.toolCallCount}</span>
      </div>
      {output.error ? (
        <p className="text-xs text-destructive">{output.error}</p>
      ) : (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono">
          {output.result}
        </pre>
      )}
    </div>
  );
}

function ParallelAgentsResult({ output }: { output: ParallelAgentsOutput }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      {output.agents.map((agent, i) => (
        <div key={i} className="rounded border border-foreground/10">
          <button
            type="button"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-foreground/5 transition-colors rounded"
          >
            <Bot className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="flex-1 truncate font-medium opacity-80">
              [{agent.role}] {agent.task.slice(0, 70)}{agent.task.length > 70 ? "…" : ""}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs">
              {agent.steps}s · {agent.toolCallCount}tc
            </span>
            {openIdx === i ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-50" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </button>
          {openIdx === i && (
            <div className="border-t border-foreground/10 px-3 py-2">
              <SubAgentResult output={agent} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type SearchResult = { title: string; url: string; snippet: string };
type SearchOutput = { results: SearchResult[] };
type FetchOutput = { title: string; content: string };
type DocumentOutput = { filename: string; content: string; summary: string };

function DocumentCard({ output }: { output: DocumentOutput }) {
  const filename = output.filename.endsWith(".md") ? output.filename : `${output.filename}.md`;

  const handleDownload = () => {
    const blob = new Blob([output.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="flex w-full items-start gap-3 rounded-md border border-foreground/10 bg-background/50 px-3 py-2 text-left transition-colors hover:bg-foreground/5 cursor-pointer"
    >
      <FileText className="h-4 w-4 shrink-0 opacity-70 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{filename}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{output.summary}</p>
      </div>
      <Download className="h-4 w-4 shrink-0 opacity-70 mt-0.5" />
    </button>
  );
}

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
  } else if (toolName === "subAgent") {
    const i = part.input as { role?: string; task?: string } | undefined;
    const roleLabel = i?.role ? `[${i.role}]` : "";
    const preview = (i?.task ?? "").slice(0, 60);
    label = `Sub-agent ${roleLabel}: ${preview}${(i?.task?.length ?? 0) > 60 ? "…" : ""}`;
  } else if (toolName === "parallelAgents") {
    const i = part.input as { agents?: unknown[] } | undefined;
    const count = i?.agents?.length ?? 0;
    const done = part.state === "output-available";
    label = done ? `Parallel agents (${count} completed)` : `Spawning ${count} agents…`;
  } else if (toolName === "createDocument") {
    const i = part.input as { filename?: string } | undefined;
    label = i?.filename ? `Document: ${i.filename}.md` : "Creating document…";
  } else {
    label = toolName;
  }

  if (toolName === "createDocument" && isDone) {
    return (
      <div className="my-1">
        <DocumentCard output={part.output as DocumentOutput} />
      </div>
    );
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
        ) : toolName === "subAgent" || toolName === "parallelAgents" ? (
          <Bot className="h-4 w-4 shrink-0 opacity-70" />
        ) : toolName === "createDocument" ? (
          <FileText className="h-4 w-4 shrink-0 opacity-70" />
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
          {toolName === "parallelAgents" ? (
            <ParallelAgentsResult output={part.output as ParallelAgentsOutput} />
          ) : toolName === "subAgent" ? (
            <SubAgentResult output={part.output as SubAgentOutput} />
          ) : toolName === "webSearch" ? (
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
