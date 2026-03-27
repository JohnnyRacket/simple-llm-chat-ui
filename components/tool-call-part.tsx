"use client";

import { AlertCircle, Bot, Check, ChevronDown, ChevronUp, Download, FileText, Globe, Loader2 } from "lucide-react";
import { useState } from "react";

type ToolPart = {
  type: string;
  toolCallId: string;
  state: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: unknown;
  output?: unknown;
  errorText?: string;
  preliminary?: boolean;
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

function ParallelAgentsPending({ output }: { output: ParallelAgentsOutput }) {
  return (
    <div className="space-y-1.5">
      {output.agents.map((agent, i) => {
        const isPending = agent.steps === 0 && !agent.error;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            {isPending ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-50" />
            ) : agent.error ? (
              <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
            ) : (
              <Check className="h-3 w-3 shrink-0 text-green-500" />
            )}
            <span className="shrink-0 text-muted-foreground">[{agent.role}]</span>
            <span className="flex-1 truncate opacity-80">
              {agent.task.slice(0, 80)}{agent.task.length > 80 ? "…" : ""}
            </span>
            {isPending && (
              <span className="shrink-0 text-muted-foreground/60 text-[10px] italic">{agent.result}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

type SearchResult = { title: string; url: string; snippet: string };
type SearchOutput = { results: SearchResult[] };
type FetchOutput = { title: string; content: string };
type DocumentOutput = { filename: string; content: string; summary: string };
type ToolDisplayState = {
  toolName: string;
  isPending: boolean;
  isError: boolean;
  hasOutput: boolean;
  isDone: boolean;
};

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

function getToolDisplayState(part: ToolPart): ToolDisplayState {
  const toolName = part.type.replace(/^tool-/, "");
  const isAgentTool = toolName === "subAgent" || toolName === "parallelAgents";
  const isPreliminary = part.preliminary === true;
  const hasOutput = part.state === "output-available";

  return {
    toolName,
    isPending:
      part.state === "input-streaming" ||
      part.state === "input-available" ||
      (isAgentTool && hasOutput && isPreliminary),
    isError: part.state === "output-error",
    hasOutput,
    isDone: hasOutput && !isPreliminary,
  };
}

function getToolLabel(part: ToolPart, state: ToolDisplayState) {
  if (state.toolName === "webSearch") {
    const query = (part.input as { query?: string } | undefined)?.query;
    return query ? `Search: ${query}` : "Searching…";
  }

  if (state.toolName === "fetchPage") {
    const url = (part.input as { url?: string } | undefined)?.url;
    return url ? `Read: ${url}` : "Reading page…";
  }

  if (state.toolName === "subAgent") {
    const input = part.input as { role?: string; task?: string } | undefined;
    const roleLabel = input?.role ? ` [${input.role}]` : "";
    const task = input?.task ?? "";
    if (!task) return "Starting sub-agent…";
    const preview = task.slice(0, 60);
    return `Sub-agent${roleLabel}: ${preview}${task.length > 60 ? "…" : ""}`;
  }

  if (state.toolName === "parallelAgents") {
    const input = part.input as { agents?: unknown[] } | undefined;
    const count = input?.agents?.length ?? 0;
    if (state.isDone) return `Parallel agents (${count} completed)`;
    return count > 0 ? `Running ${count} sub-agents…` : "Starting sub-agents…";
  }

  if (state.toolName === "createDocument") {
    const input = part.input as { filename?: string } | undefined;
    return input?.filename ? `Document: ${input.filename}.md` : "Creating document…";
  }

  return state.toolName;
}

export function ToolCallPart({ part }: { part: ToolPart }) {
  const [expanded, setExpanded] = useState(false);
  const state = getToolDisplayState(part);
  const label = getToolLabel(part, state);

  if (state.toolName === "createDocument" && state.isDone) {
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
        onClick={() => state.isDone && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors rounded-md ${state.isDone ? "hover:bg-foreground/5 cursor-pointer" : "cursor-default"}`}
      >
        {state.isPending ? (
          <Loader2 className="h-4 w-4 shrink-0 opacity-70 animate-spin" />
        ) : state.isError ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        ) : state.toolName === "subAgent" || state.toolName === "parallelAgents" ? (
          <Bot className="h-4 w-4 shrink-0 opacity-70" />
        ) : state.toolName === "createDocument" ? (
          <FileText className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <Globe className="h-4 w-4 shrink-0 opacity-70" />
        )}
        <span className="flex-1 truncate font-medium opacity-90">{label}</span>
        {state.isDone && (
          expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
          )
        )}
        {state.isError && <span className="text-xs text-destructive">failed</span>}
      </button>

      {state.toolName === "parallelAgents" && state.isPending && state.hasOutput && (
        <div className="border-t border-foreground/10 px-3 py-2">
          <ParallelAgentsPending output={part.output as ParallelAgentsOutput} />
        </div>
      )}

      {expanded && state.isDone && (
        <div className="border-t border-foreground/10 px-3 py-2">
          {state.toolName === "parallelAgents" ? (
            <ParallelAgentsResult output={part.output as ParallelAgentsOutput} />
          ) : state.toolName === "subAgent" ? (
            <SubAgentResult output={part.output as SubAgentOutput} />
          ) : state.toolName === "webSearch" ? (
            <SearchResults output={part.output as SearchOutput} />
          ) : state.toolName === "fetchPage" ? (
            <PageContent output={part.output as FetchOutput} />
          ) : (
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          )}
        </div>
      )}

      {state.isError && (
        <div className="border-t border-foreground/10 px-3 py-2">
          <p className="text-xs text-destructive">{part.errorText ?? "Tool call failed"}</p>
        </div>
      )}
    </div>
  );
}
