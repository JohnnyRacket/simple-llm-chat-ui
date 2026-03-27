"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatInput, PORTS, type ServerInfo } from "@/components/chat-input";
import type { ModelInfo } from "@/components/model-picker";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useUser } from "@/components/user-provider";
import { useChatHistory } from "@/hooks/use-chat-history";

export default function Home() {
  const user = useUser();
  const router = useRouter();
  const { chats, removeChat } = useChatHistory();

  const [sending, setSending] = useState(false);
  const [selectedPort, setSelectedPort] = useState("8080");
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [reasoningEnabled, setReasoningEnabled] = useState(true);
  const [modelsInfo, setModelsInfo] = useState<Record<string, ServerInfo>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || sending) return;

      setSending(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              id: crypto.randomUUID(),
              role: "user",
              parts: [{ type: "text", text }],
            },
            port: selectedPort,
            enableTools: toolsEnabled,
            enableReasoning: reasoningEnabled,
          }),
        });

        const chatId = res.headers.get("X-Chat-Id");
        if (chatId) {
          router.push(`/chat/${chatId}`);
        }
      } catch {
        setSending(false);
      }
    },
    [sending, selectedPort, toolsEnabled, reasoningEnabled, router]
  );

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await removeChat(chatId);
    },
    [removeChat]
  );

  const serverInfo = modelsInfo[selectedPort] ?? {
    contextSize: 0,
    modelName: null,
    paramsB: null,
  };

  const models: ModelInfo[] = PORTS.map((port) => ({
    port,
    modelName: modelsInfo[port]?.modelName ?? null,
    paramsB: modelsInfo[port]?.paramsB ?? null,
  })).filter((m) => m.modelName !== null);

  return (
    <div className="flex h-dvh bg-background">
      <ChatSidebar
        chats={chats}
        activeChatId={null}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="flex flex-col flex-1 min-w-0 relative">
        <div className="absolute top-3 right-5 z-10">
          <ThemeToggle />
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl space-y-4">
            <h2 className="text-2xl font-semibold text-center text-muted-foreground">
              What can I help you with, {user.name}?
            </h2>
            <ChatInput
              isLoading={sending}
              hasMessages={false}
              onSend={handleSend}
              showUsage={false}
              usage={undefined}
              serverInfo={serverInfo}
              models={models}
              selectedPort={selectedPort}
              onSelectPort={setSelectedPort}
              toolsEnabled={toolsEnabled}
              onToggleTools={setToolsEnabled}
              reasoningEnabled={reasoningEnabled}
              onToggleReasoning={setReasoningEnabled}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
