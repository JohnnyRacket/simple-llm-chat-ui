"use client";

import { memo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContextUsageBar } from "@/components/context-usage-bar";
import { ModelPicker, type ModelInfo } from "@/components/model-picker";
import { Brain, GitFork, Globe, Paperclip, Send, X, FileText, Loader2 } from "lucide-react";
import type { UIMessage } from "ai";

const PORTS = ["8080", "8081"];

type ServerInfo = {
  contextSize: number;
  modelName: string | null;
  paramsB: number | null;
};

type ChatMessage = UIMessage<{
  usage?: {
    inputTokens: number;
    outputTokens: number;
    promptTps: number | null;
    generationTps: number | null;
    totalTimeMs: number | null;
  };
}>;

type Attachment = {
  filename: string;
  text: string;
  pageCount: number;
};

export type { ServerInfo, ChatMessage };
export { PORTS };

export const ChatInput = memo(function ChatInput({
  isLoading,
  hasMessages,
  onSend,
  onFork,
  showUsage,
  usage,
  serverInfo,
  models,
  selectedPort,
  onSelectPort,
  toolsEnabled,
  onToggleTools,
  reasoningEnabled,
  onToggleReasoning,
}: {
  isLoading: boolean;
  hasMessages: boolean;
  onSend: (text: string) => void;
  onFork?: () => void;
  showUsage: boolean;
  usage: NonNullable<ChatMessage["metadata"]>["usage"] | undefined;
  serverInfo: ServerInfo;
  models: ModelInfo[];
  selectedPort: string;
  onSelectPort: (port: string) => void;
  toolsEnabled: boolean;
  onToggleTools: (enabled: boolean) => void;
  reasoningEnabled: boolean;
  onToggleReasoning: (enabled: boolean) => void;
}) {
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
        <div className="flex items-center gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
          >
            <Paperclip className="h-3.5 w-3.5" />
            File upload
          </button>
          <button
            type="button"
            onClick={() => onToggleTools(!toolsEnabled)}
            aria-pressed={toolsEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              toolsEnabled
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Web search
          </button>
          <button
            type="button"
            onClick={() => onToggleReasoning(!reasoningEnabled)}
            aria-pressed={reasoningEnabled}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              reasoningEnabled
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Thinking
          </button>
          {onFork && (
            <button
              type="button"
              onClick={onFork}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-auto"
            >
              <GitFork className="h-3.5 w-3.5" />
              Fork
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
            <Button type="submit" className="h-auto px-3" disabled={!canSend}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send</span>
            </Button>
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
                    onSelect={onSelectPort}
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
