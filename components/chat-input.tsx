"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ContextUsageBar } from "@/components/context-usage-bar";
import { ModelPicker, type ModelInfo } from "@/components/model-picker";
import { Send } from "lucide-react";
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

export type { ServerInfo, ChatMessage };
export { PORTS };

export const ChatInput = memo(function ChatInput({
  isLoading,
  hasMessages,
  onSend,
  showUsage,
  usage,
  serverInfo,
  models,
  selectedPort,
  onSelectPort,
}: {
  isLoading: boolean;
  hasMessages: boolean;
  onSend: (text: string) => void;
  showUsage: boolean;
  usage: NonNullable<ChatMessage["metadata"]>["usage"] | undefined;
  serverInfo: ServerInfo;
  models: ModelInfo[];
  selectedPort: string;
  onSelectPort: (port: string) => void;
}) {
  const [input, setInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input);
    setInput("");
  }

  return (
    <div className={hasMessages ? "p-4 shrink-0" : ""}>
      <div className="mx-auto max-w-2xl rounded-xl border bg-background shadow-sm">
        <form onSubmit={handleSubmit}>
          <div className="flex items-stretch gap-2 p-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none"
              autoFocus
            />
            <Button type="submit" className="h-auto px-3" disabled={isLoading || !input.trim()}>
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
