"use client";

import { useCallback, useEffect, useState } from "react";

export type ChatListItem = {
  id: string;
  title: string;
  updatedAt: string;
};

export function useChatHistory() {
  const [chats, setChats] = useState<ChatListItem[]>([]);

  const refreshChats = useCallback(async () => {
    try {
      const res = await fetch("/api/chats");
      if (res.ok) {
        setChats(await res.json());
      }
    } catch {}
  }, []);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  const removeChat = useCallback(
    async (chatId: string) => {
      const res = await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
      }
    },
    []
  );

  return {
    chats,
    refreshChats,
    removeChat,
  };
}
