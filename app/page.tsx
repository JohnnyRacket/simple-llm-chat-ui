"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownMessage } from "@/components/markdown-message";
import { ContextUsageBar } from "@/components/context-usage-bar";
import { ResponseStats } from "@/components/response-stats";
import { ModelPicker, type ModelInfo } from "@/components/model-picker";
import { Send } from "lucide-react";

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

export default function Chat() {
  const { messages, sendMessage, status } = useChat<ChatMessage>();
  const [input, setInput] = useState("");
  const [selectedPort, setSelectedPort] = useState("8080");
  const [modelsInfo, setModelsInfo] = useState<Record<string, ServerInfo>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const usage = lastAssistant?.metadata?.usage;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    PORTS.forEach((port) => {
      fetch(`/api/server-info?port=${port}`)
        .then((res) => res.json())
        .then((data: ServerInfo) => {
          setModelsInfo((prev) => ({ ...prev, [port]: data }));
        })
        .catch(() => {});
    });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input }, { body: { port: selectedPort } });
    setInput("");
  }

  const serverInfo = modelsInfo[selectedPort] ?? {
    contextSize: 0,
    modelName: null,
    paramsB: null,
  };
  const showUsage = usage && serverInfo.contextSize > 0;

  const models: ModelInfo[] = PORTS.map((port) => ({
    port,
    modelName: modelsInfo[port]?.modelName ?? null,
    paramsB: modelsInfo[port]?.paramsB ?? null,
  })).filter((m) => m.modelName !== null);

  const inputIsland = (
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
              disabled={isLoading}
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

  return (
    <main className="flex flex-col h-dvh bg-background">
      <div className="absolute top-3 right-5 z-10">
        <ThemeToggle />
      </div>

      {hasMessages ? (
        <>
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-2xl space-y-4">
              {messages.map((message, idx) => {
                const isCompleted =
                  message.role === "assistant" &&
                  (status === "ready" || idx !== messages.length - 1);
                const statsUsage = isCompleted ? message.metadata?.usage : null;

                return (
                  <div key={message.id}>
                    <div
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`rounded-lg px-4 py-2 max-w-[80%] ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground"
                        }`}
                      >
                        {message.parts.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <MarkdownMessage
                                key={i}
                                content={part.text}
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                    {statsUsage && <ResponseStats usage={statsUsage} />}
                  </div>
                );
              })}

              {isLoading &&
                messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2 text-muted-foreground">
                      Thinking...
                    </div>
                  </div>
                )}

              <div ref={scrollRef} />
            </div>
          </div>
          {inputIsland}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl space-y-4">
            <h2 className="text-2xl font-semibold text-center text-muted-foreground">
              What can I help you with?
            </h2>
            {inputIsland}
          </div>
        </div>
      )}
    </main>
  );
}
