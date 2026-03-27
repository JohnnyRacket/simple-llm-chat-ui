"use client";

import { AlertCircle, Bot, Check, ChevronDown, ChevronUp, Code, Download, FileText, Globe, LayoutDashboard, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WidgetFrame } from "@/components/widget-frame";

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
  result: string;
  error?: string;
  pending?: boolean;
};

type ParallelAgentOutput = {
  task: string;
  result: string;
  error?: string;
  pending?: boolean;
};

type ParallelAgentsOutput = {
  agents: ParallelAgentOutput[];
};

function SubAgentResult({ output }: { output: SubAgentOutput }) {
  return (
    <div className="space-y-2">
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
              {agent.task.slice(0, 70)}{agent.task.length > 70 ? "…" : ""}
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
        const isPending = agent.pending === true && !agent.error;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            {isPending ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-50" />
            ) : agent.error ? (
              <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />
            ) : (
              <Check className="h-3 w-3 shrink-0 text-green-500" />
            )}
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

type WidgetOutput = { html: string; title: string };
type SearchResult = { title: string; url: string; snippet: string };
type SearchOutput = { results: SearchResult[] };
type FetchLink = { text: string; href: string };
type FetchOutput = { title: string; content: string; links?: FetchLink[] };
type DocumentOutput = { filename: string; content: string; summary: string };
type CodeExecutionOutput = { stdout: string; stderr: string; exitCode: number; language: string; truncated?: boolean };
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

function CodeExecutionResult({ part, output }: { part: ToolPart; output: CodeExecutionOutput }) {
  const code = (part.input as { code?: string } | undefined)?.code ?? "";
  const success = output.exitCode === 0;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">{output.language}</p>
        <pre className="max-h-64 overflow-y-auto rounded bg-foreground/5 p-2 whitespace-pre-wrap break-words text-xs font-mono text-foreground/80">{code}</pre>
      </div>
      {output.stdout && (
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/70 font-medium">stdout</p>
          <pre className="max-h-48 overflow-y-auto rounded bg-foreground/5 p-2 whitespace-pre-wrap break-words text-xs font-mono text-foreground/80">{output.stdout}</pre>
        </div>
      )}
      {output.stderr && (
        <div>
          <p className={`mb-1 text-[10px] uppercase tracking-wide font-medium ${success ? "text-muted-foreground/70" : "text-destructive/70"}`}>stderr</p>
          <pre className={`max-h-48 overflow-y-auto rounded p-2 whitespace-pre-wrap break-words text-xs font-mono ${success ? "bg-foreground/5 text-foreground/80" : "bg-destructive/5 text-destructive/90"}`}>{output.stderr}</pre>
        </div>
      )}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70">
        <span className={success ? "text-green-600 dark:text-green-400" : "text-destructive"}>exit {output.exitCode}</span>
        {output.truncated && <span className="italic">Output truncated to 8,000 chars</span>}
      </div>
    </div>
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
  const [linksOpen, setLinksOpen] = useState(false);
  const links = output.links ?? [];
  return (
    <div className="space-y-2">
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono">
        {output.content.trim()}
      </pre>
      {links.length > 0 && (
        <div className="rounded border border-foreground/10">
          <button
            type="button"
            onClick={() => setLinksOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-foreground/5 transition-colors rounded"
          >
            <Globe className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="flex-1 font-medium opacity-80">
              {links.length} link{links.length !== 1 ? "s" : ""} found
            </span>
            {linksOpen ? (
              <ChevronUp className="h-3.5 w-3.5 shrink-0 opacity-50" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </button>
          {linksOpen && (
            <div className="border-t border-foreground/10 px-3 py-2 max-h-48 overflow-y-auto">
              <ol className="space-y-1 text-xs">
                {links.map((link, i) => (
                  <li key={i} className="space-y-0.5">
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-blue-600 dark:text-blue-400 hover:underline block truncate"
                    >
                      {link.text}
                    </a>
                    <p className="text-muted-foreground/60 truncate text-[10px]">{link.href}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
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
    const input = part.input as { task?: string } | undefined;
    const task = input?.task ?? "";
    if (!task) return "Starting sub-agent…";
    const preview = task.slice(0, 60);
    return `Sub-agent: ${preview}${task.length > 60 ? "…" : ""}`;
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

  if (state.toolName === "executeCode") {
    const input = part.input as { language?: string } | undefined;
    const lang = input?.language ?? "code";
    return state.isPending ? `Running ${lang}…` : `Executed ${lang}`;
  }

  if (state.toolName === "renderWidget") {
    const input = part.input as { title?: string } | undefined;
    return input?.title ? `Widget: ${input.title}` : state.isPending ? "Building widget…" : "Widget";
  }

  return state.toolName;
}

function ExecuteCodePending({ part }: { part: ToolPart }) {
  const input = part.input as { language?: string; code?: string } | undefined;
  const language = input?.language ?? "code";
  const code = input?.code ?? "";
  const isStreaming = part.state === "input-streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming) bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [code, isStreaming]);

  return (
    <div className="my-1 rounded-md border border-foreground/10 bg-background/50 text-foreground overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
        <span className="flex-1 truncate text-sm font-medium opacity-90">
          {isStreaming ? `Writing ${language}…` : `Running ${language}…`}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono">{code.length} chars</span>
      </div>
      {code && (
        <div className="border-t border-foreground/10 bg-foreground/[0.02] px-3 py-2 max-h-64 overflow-y-auto">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground/50 font-medium">{language}</p>
          <pre className="whitespace-pre-wrap break-all text-[11px] text-muted-foreground/60 font-mono leading-relaxed">
            {code}
            <div ref={bottomRef} />
          </pre>
        </div>
      )}
    </div>
  );
}

function WidgetStreamingPreview({ part }: { part: ToolPart }) {
  const input = part.input as { html?: string; title?: string } | undefined;
  const html = input?.html ?? "";
  const title = input?.title ?? "";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [html]);

  return (
    <div className="my-1 rounded-md border border-foreground/10 bg-background/50 text-foreground overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-70" />
        <span className="flex-1 truncate text-sm font-medium opacity-90">
          {title ? `Building: ${title}` : "Building widget…"}
        </span>
        <span className="shrink-0 text-[10px] text-muted-foreground/50 font-mono">{html.length} chars</span>
      </div>
      {html && (
        <div className="border-t border-foreground/10 bg-foreground/[0.02] px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap break-all text-[11px] text-muted-foreground/60 font-mono leading-relaxed">
            {html}
            <div ref={bottomRef} />
          </pre>
        </div>
      )}
    </div>
  );
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

  if (state.toolName === "renderWidget" && state.isDone) {
    const output = part.output as WidgetOutput;
    return <WidgetFrame html={output.html} title={output.title} />;
  }

  if (state.toolName === "renderWidget" && state.isPending) {
    return <WidgetStreamingPreview part={part} />;
  }

  if (state.toolName === "executeCode" && state.isPending) {
    return <ExecuteCodePending part={part} />;
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
        ) : state.toolName === "executeCode" ? (
          <Code className="h-4 w-4 shrink-0 opacity-70" />
        ) : state.toolName === "renderWidget" ? (
          <LayoutDashboard className="h-4 w-4 shrink-0 opacity-70" />
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
          ) : state.toolName === "executeCode" ? (
            <CodeExecutionResult part={part} output={part.output as CodeExecutionOutput} />
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
