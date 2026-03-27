"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChatSidebar } from "@/components/chat-sidebar";
import type { ChatListItem } from "@/hooks/use-chat-history";

export function ChatShell({
  chats: initialChats,
  activeChatId,
  children,
}: {
  chats: ChatListItem[];
  activeChatId: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [chats, setChats] = useState(initialChats);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
        if (activeChatId === chatId) {
          router.push("/");
        }
      }
    },
    [activeChatId, router]
  );

  return (
    <div className="flex h-dvh bg-background">
      <ChatSidebar
        chats={chats}
        activeChatId={activeChatId}
        onDeleteChat={handleDeleteChat}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      {children}
    </div>
  );
}
