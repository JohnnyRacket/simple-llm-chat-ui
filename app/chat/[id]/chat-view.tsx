"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage, type ReasoningUIPart } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { MarkdownMessage } from "@/components/markdown-message";
import { FileAttachment } from "@/components/file-attachment";
import { ResponseStats } from "@/components/response-stats";
import { ChatInput, type ChatMessage } from "@/components/chat-input";
import { useChatSettings } from "@/components/chat-settings-provider";
import { ToolCallPart } from "@/components/tool-call-part";
import { ReasoningPart } from "@/components/reasoning-part";
import { useChatRecovery } from "@/hooks/use-chat-recovery";

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

function getLastAssistantMessage(messages: ChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "assistant");
}

function messagesMatch(left: ChatMessage[], right: ChatMessage[]) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const {
    selectedPort,
    setSelectedPort,
    toolsEnabled,
    agentsEnabled,
    agentPort,
    reasoningEnabled,
    createDocumentEnabled,
    programmaticEnabled,
    serverInfo,
  } = useChatSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  // Sync latest settings into a single ref so the memoized transport can read them
  type SettingsSnapshot = {
    selectedPort: string;
    toolsEnabled: boolean;
    agentsEnabled: boolean;
    agentPort: string;
    reasoningEnabled: boolean;
    createDocumentEnabled: boolean;
    programmaticEnabled: boolean;
  };
  const settingsRef = useRef<SettingsSnapshot>({ selectedPort, toolsEnabled, agentsEnabled, agentPort, reasoningEnabled, createDocumentEnabled, programmaticEnabled });
  useEffect(() => {
    settingsRef.current = { selectedPort, toolsEnabled, agentsEnabled, agentPort, reasoningEnabled, createDocumentEnabled, programmaticEnabled };
  }, [selectedPort, toolsEnabled, agentsEnabled, agentPort, reasoningEnabled, createDocumentEnabled, programmaticEnabled]);

  // Initialize port from the chat's stored port on mount
  useEffect(() => {
    setSelectedPort(port);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages }) => ({
          body: {
            id,
            message: messages[messages.length - 1],
            port: settingsRef.current.selectedPort,
            enableTools: settingsRef.current.toolsEnabled,
            enableAgents: settingsRef.current.agentsEnabled,
            agentPort: settingsRef.current.agentPort,
            enableReasoning: settingsRef.current.reasoningEnabled,
            enableCreateDocument: settingsRef.current.createDocumentEnabled,
            enableProgrammatic: settingsRef.current.programmaticEnabled,
          },
        }),
      }),
    []
  );

  const {
    messages,
    sendMessage,
    setMessages,
    resumeStream,
    clearError,
    stop,
    status,
  } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages as ChatMessage[],
    transport,
    resume: false,
  });

  const finalizeFromDbIfStreamEnded = useCallback(async () => {
    const streamProbe = await fetch(`/api/chat/${chatId}/stream`, {
      method: "HEAD",
      cache: "no-store",
    });

    if (streamProbe.status !== 204) {
      return;
    }

    const messagesRes = await fetch(`/api/chats/${chatId}/messages`, {
      cache: "no-store",
    });

    if (!messagesRes.ok) {
      return;
    }

    const latestMessages = (await messagesRes.json()) as ChatMessage[];
    if (!messagesMatch(latestMessages, messages)) {
      setMessages(latestMessages);
    }
    clearError();
  }, [chatId, clearError, messages, setMessages]);

  const resumeWithFallback = useCallback(async () => {
    await resumeStream();
    await finalizeFromDbIfStreamEnded();
  }, [finalizeFromDbIfStreamEnded, resumeStream]);

  const didInitialResumeRef = useRef(false);
  useEffect(() => {
    if (didInitialResumeRef.current) return;
    didInitialResumeRef.current = true;
    void resumeWithFallback();
  }, [resumeWithFallback]);

  useChatRecovery({
    messages,
    status,
    resumeStream: resumeWithFallback,
    finalizeStream: finalizeFromDbIfStreamEnded,
  });

  const isLoading =
    status === "submitted" || status === "streaming" || status === "error";
  const hasMessages = messages.length > 0;

  const lastMessage = messages[messages.length - 1];
  const lastAssistantIsEmpty =
    lastMessage?.role === "assistant" &&
    !lastMessage.parts.some(
      (p) =>
        (p.type === "text" && (p as { text: string }).text.trim().length > 0) ||
        p.type === "reasoning" ||
        p.type.startsWith("tool-")
    );
  const showLoader = isLoading;

  const lastAssistant = getLastAssistantMessage(messages);
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

  const handleFork = useCallback(async () => {
    const res = await fetch(`/api/chats/${chatId}/fork`, { method: "POST" });
    if (res.ok) {
      const { chatId: newChatId } = await res.json();
      router.push(`/chat/${newChatId}`);
    }
  }, [chatId, router]);

  const [isCompactForking, setIsCompactForking] = useState(false);

  const handleCompactFork = useCallback(async () => {
    setIsCompactForking(true);
    try {
      const res = await fetch(`/api/chats/${chatId}/compact-fork`, { method: "POST" });
      if (res.ok) {
        const { chatId: newChatId } = await res.json();
        router.push(`/chat/${newChatId}`);
      }
    } finally {
      setIsCompactForking(false);
    }
  }, [chatId, router]);

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage]
  );

  const handleStop = useCallback(() => {
    stop();
    void fetch(`/api/chat/${chatId}/stream`, { method: "DELETE" });
  }, [stop, chatId]);

  const showUsage = usage && serverInfo.contextSize > 0;

  const inputIsland = (
    <ChatInput
      isLoading={isLoading}
      hasMessages={hasMessages}
      onSend={handleSend}
      onStop={handleStop}
      onFork={handleFork}
      onCompactFork={handleCompactFork}
      isCompactForking={isCompactForking}
      showUsage={!!showUsage}
      usage={usage}
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
                const isLastMessage = idx === messages.length - 1;
                if (isLastMessage && lastAssistantIsEmpty && isLoading) return null;

                const isCompleted =
                  message.role === "assistant" &&
                  (status === "ready" || !isLastMessage);
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

              {showLoader && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-4 py-3 flex gap-1 items-center">
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" />
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
          <div className="w-full max-w-4xl space-y-4">
            {inputIsland}
          </div>
        </div>
      )}
    </main>
  );
}
