"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { ChatInput } from "@/components/chat-input";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useUser } from "@/components/user-provider";
import { useChatSettings } from "@/components/chat-settings-provider";
import { useChatHistory } from "@/hooks/use-chat-history";

export default function Home() {
  const user = useUser();
  const router = useRouter();
  const { chats, removeChat } = useChatHistory();

  const { selectedPort, toolsEnabled, agentsEnabled, agentPort, reasoningEnabled, createDocumentEnabled } = useChatSettings();
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
            enableAgents: agentsEnabled,
            agentPort,
            enableReasoning: reasoningEnabled,
            enableCreateDocument: createDocumentEnabled,
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
    [sending, selectedPort, toolsEnabled, agentsEnabled, agentPort, reasoningEnabled, createDocumentEnabled, router]
  );

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await removeChat(chatId);
    },
    [removeChat]
  );

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
            />
          </div>
        </div>
      </main>
    </div>
  );
}
