"use client";

import { memo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContextUsageBar } from "@/components/context-usage-bar";
import { ModelPicker } from "@/components/model-picker";
import { useChatSettings, PORTS } from "@/components/chat-settings-provider";
import { ArrowUp, Bot, Brain, Code, GitFork, LayoutDashboard, Minimize2, Paperclip, Square, Wrench, X, FileText, Loader2 } from "lucide-react";
import type { UIMessage } from "ai";

type ChatMessage = UIMessage<{
  usage?: {
    inputTokens: number;
    outputTokens: number;
    promptTps: number | null;
    generationTps: number | null;
    totalTimeMs: number | null;
  };
}>;

function squigglyPath(cx: number, cy: number, r: number, amplitude: number, teeth: number): string {
  const pts: string[] = [];
  const points = 120;
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    const radius = r + amplitude * Math.sin(teeth * theta);
    const x = (cx + radius * Math.cos(theta)).toFixed(2);
    const y = (cy + radius * Math.sin(theta)).toFixed(2);
    pts.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  pts.push("Z");
  return pts.join(" ");
}

type Attachment = {
  filename: string;
  text: string;
  pageCount: number;
};

export type { ChatMessage };

export const ChatInput = memo(function ChatInput({
  isLoading,
  hasMessages,
  onSend,
  onStop,
  onFork,
  onCompactFork,
  isCompactForking,
  showUsage,
  usage,
}: {
  isLoading: boolean;
  hasMessages: boolean;
  onSend: (text: string) => void;
  onStop?: () => void;
  onFork?: () => void;
  onCompactFork?: () => void;
  isCompactForking?: boolean;
  showUsage: boolean;
  usage: NonNullable<ChatMessage["metadata"]>["usage"] | undefined;
}) {
  const {
    selectedPort,
    setSelectedPort,
    toolsEnabled,
    setToolsEnabled,
    agentsEnabled,
    setAgentsEnabled,
    agentPort,
    setAgentPort,
    reasoningEnabled,
    setReasoningEnabled,
    createDocumentEnabled,
    setCreateDocumentEnabled,
    programmaticEnabled,
    setProgrammaticEnabled,
    widgetEnabled,
    setWidgetEnabled,
    serverInfo,
    modelsInfo,
    models,
  } = useChatSettings();
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [parsing, setParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function buildMessage(): string {
    let text = "";
    for (const att of attachments) {
      text += `<file name="${att.filename}" pages="${att.pageCount}">\n${att.text}\n</file>\n\n`;
    }
    text += input;
    return text;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || parsing) return;
    onSend(buildMessage());
    setInput("");
    setAttachments([]);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setParsing(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/parse", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          setAttachments((prev) => [
            ...prev,
            { filename: data.filename, text: data.text, pageCount: data.pageCount },
          ]);
        }
      }
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  const canSend = (input.trim() || attachments.length > 0) && !isLoading && !parsing;

  return (
    <div className={hasMessages ? "p-4 shrink-0" : ""}>
      <div className="mx-auto max-w-4xl rounded-xl border bg-background shadow-sm">
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">File upload</span>
          </button>
          <button
            type="button"
            onClick={() => setToolsEnabled(!toolsEnabled)}
            aria-pressed={toolsEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              toolsEnabled
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tools</span>
          </button>
          <button
            type="button"
            onClick={() => setReasoningEnabled(!reasoningEnabled)}
            aria-pressed={reasoningEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              reasoningEnabled
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thinking</span>
          </button>
          <button
            type="button"
            onClick={() => setAgentsEnabled(!agentsEnabled)}
            aria-pressed={agentsEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              agentsEnabled
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sub Agents</span>
          </button>
          {agentsEnabled && (
            <div className="inline-flex items-center gap-1 rounded-md bg-purple-100 dark:bg-purple-900/40 px-1.5 py-1">
              <span className="text-xs text-purple-600 dark:text-purple-300 opacity-70">agents:</span>
              {PORTS.map((p) => {
                const info = modelsInfo[p];
                const label = info?.paramsB ? `${info.paramsB}B` : `:${p}`;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAgentPort(p)}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                      agentPort === p
                        ? "bg-purple-600 text-white"
                        : "text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setProgrammaticEnabled(!programmaticEnabled)}
            aria-pressed={programmaticEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              programmaticEnabled
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Code className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Programmatic</span>
          </button>
          <button
            type="button"
            onClick={() => setWidgetEnabled(!widgetEnabled)}
            aria-pressed={widgetEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              widgetEnabled
                ? "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Widgets</span>
          </button>
          {toolsEnabled && (
            <button
              type="button"
              onClick={() => setCreateDocumentEnabled(!createDocumentEnabled)}
              aria-pressed={createDocumentEnabled}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                createDocumentEnabled
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Create Doc</span>
            </button>
          )}
          {onCompactFork && (
            <button
              type="button"
              onClick={onCompactFork}
              disabled={isCompactForking}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-auto disabled:opacity-50"
            >
              {isCompactForking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Compact & Fork</span>
            </button>
          )}
          {onFork && (
            <button
              type="button"
              onClick={onFork}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors${onCompactFork ? "" : " ml-auto"}`}
            >
              <GitFork className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Fork</span>
            </button>
          )}
        </div>

        {/* Attached files */}
        {(attachments.length > 0 || parsing) && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((att, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-foreground"
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate max-w-[180px]">{att.filename}</span>
                <span className="text-muted-foreground">
                  ({att.pageCount} {att.pageCount === 1 ? "page" : "pages"})
                </span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 rounded hover:bg-background p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {parsing && (
              <div className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Parsing...
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,.pptx,.ppt,.rtf,.odt,.html,.htm,.json,.xml,.yaml,.yml,.py,.js,.ts,.tsx,.jsx,.java,.go,.rs,.c,.cpp,.h,.rb,.php,.sh,.sql"
          />
          <div className="flex items-stretch gap-2 px-3 py-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={attachments.length > 0 ? "Ask about the file..." : "Type a message..."}
              className="flex-1 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none"
              autoFocus
            />
            {isLoading ? (
              <div className="relative h-8 w-8">
                <svg
                  className="absolute -inset-1 animate-spin [animation-duration:6s] pointer-events-none"
                  viewBox="0 0 40 40"
                  style={{ width: 40, height: 40 }}
                >
                  <path
                    d={`${squigglyPath(20, 20, 16, 2, 8)} M 33.5,20 A 13.5,13.5 0 1,0 6.5,20 A 13.5,13.5 0 1,0 33.5,20 Z`}
                    fill="currentColor"
                    fillRule="evenodd"
                  />
                </svg>
                <Button
                  type="button"
                  className="h-8 w-8 rounded-full p-0"
                  onClick={onStop}
                >
                  <Square className="h-4 w-4" />
                  <span className="sr-only">Stop</span>
                </Button>
              </div>
            ) : (
              <Button type="submit" className="h-8 w-8 rounded-full p-0" disabled={!canSend}>
                <ArrowUp className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            )}
          </div>
        </form>
        {(showUsage || models.length > 0) && (
          <div className="border-t px-3 py-2">
            <ContextUsageBar
              inputTokens={usage?.inputTokens ?? 0}
              outputTokens={usage?.outputTokens ?? 0}
              contextSize={serverInfo.contextSize}
              modelPicker={
                models.length > 0 ? (
                  <ModelPicker
                    models={models}
                    selectedPort={selectedPort}
                    onSelect={setSelectedPort}
                  />
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
});
