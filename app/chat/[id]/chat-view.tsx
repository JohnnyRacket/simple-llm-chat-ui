"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type ReasoningUIPart } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownMessage } from "@/components/markdown-message";
import { FileAttachment } from "@/components/file-attachment";
import { ResponseStats } from "@/components/response-stats";
import { ChatInput, PORTS, type ServerInfo, type ChatMessage } from "@/components/chat-input";
import { ToolCallPart } from "@/components/tool-call-part";
import { ReasoningPart } from "@/components/reasoning-part";
import type { ModelInfo } from "@/components/model-picker";

type MessageSegment =
  | { type: "text"; text: string }
  | { type: "file"; filename: string; pages: number; content: string };

function parseMessageParts(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const regex = /<file name="([^"]+)"(?:\s+pages="(\d+)")?>([\s\S]*?)<\/file>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "file",
      filename: match[1],
      pages: match[2] ? parseInt(match[2], 10) : 0,
      content: match[3],
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

export function ChatView({
  chatId,
  initialMessages,
  port,
}: {
  chatId: string;
  initialMessages: UIMessage[];
  port: string;
}) {
  const router = useRouter();
  const [selectedPort, setSelectedPort] = useState(port);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [reasoningEnabled, setReasoningEnabled] = useState(true);
  const [modelsInfo, setModelsInfo] = useState<Record<string, ServerInfo>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const selectedPortRef = useRef(selectedPort);
  const toolsEnabledRef = useRef(toolsEnabled);
  const reasoningEnabledRef = useRef(reasoningEnabled);
  useEffect(() => { selectedPortRef.current = selectedPort; }, [selectedPort]);
  useEffect(() => { toolsEnabledRef.current = toolsEnabled; }, [toolsEnabled]);
  useEffect(() => { reasoningEnabledRef.current = reasoningEnabled; }, [reasoningEnabled]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: {
            id,
            message: messages[messages.length - 1],
            port: selectedPortRef.current,
            enableTools: toolsEnabledRef.current,
            enableReasoning: reasoningEnabledRef.current,
          },
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const { messages, sendMessage, status } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages as ChatMessage[],
    transport,
    resume: true,
  });

  const isLoading = status === "submitted" || status === "streaming";
  const hasMessages = messages.length > 0;

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const usage = lastAssistant?.metadata?.usage;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 32;
  }, []);

  useEffect(() => {
    if (shouldAutoScroll.current) {
      scrollRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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

  const handleFork = useCallback(async () => {
    const res = await fetch(`/api/chats/${chatId}/fork`, { method: "POST" });
    if (res.ok) {
      const { chatId: newChatId } = await res.json();
      router.push(`/chat/${newChatId}`);
    }
  }, [chatId, router]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

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
    <ChatInput
      isLoading={isLoading}
      hasMessages={hasMessages}
      onSend={handleSend}
      onFork={handleFork}
      showUsage={!!showUsage}
      usage={usage}
      serverInfo={serverInfo}
      models={models}
      selectedPort={selectedPort}
      onSelectPort={setSelectedPort}
      toolsEnabled={toolsEnabled}
      onToggleTools={setToolsEnabled}
      reasoningEnabled={reasoningEnabled}
      onToggleReasoning={setReasoningEnabled}
    />
  );

  return (
    <main className="flex flex-col flex-1 min-w-0 relative">
      <div className="absolute top-3 right-5 z-10">
        <ThemeToggle />
      </div>

      {hasMessages ? (
        <>
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-4xl space-y-4">
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
                            return parseMessageParts(part.text).map((seg, j) =>
                              seg.type === "file" ? (
                                <FileAttachment
                                  key={`${i}-${j}`}
                                  filename={seg.filename}
                                  pages={seg.pages}
                                  content={seg.content}
                                />
                              ) : (
                                <MarkdownMessage key={`${i}-${j}`} content={seg.text} />
                              )
                            );
                          }
                          if (part.type === "reasoning") {
                            return (
                              <ReasoningPart
                                key={i}
                                part={part as ReasoningUIPart}
                              />
                            );
                          }
                          if (part.type.startsWith("tool-")) {
                            return (
                              <ToolCallPart
                                key={i}
                                part={part as Parameters<typeof ToolCallPart>[0]["part"]}
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


              <div ref={scrollRef} />
            </div>
          </div>
          {inputIsland}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl space-y-4">
            {inputIsland}
          </div>
        </div>
      )}
    </main>
  );
}
