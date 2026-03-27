"use client";

import Link from "next/link";
import { Plus, PanelLeft, Trash2 } from "lucide-react";
import type { ChatListItem } from "@/hooks/use-chat-history";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ChatSidebar({
  chats,
  activeChatId,
  onDeleteChat,
  isOpen,
  onToggle,
}: {
  chats: ChatListItem[];
  activeChatId: string | null;
  onDeleteChat: (id: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Toggle button when collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-3 left-3 z-20 p-2 rounded-md hover:bg-muted text-muted-foreground"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed md:relative z-40 h-dvh flex flex-col
          bg-sidebar border-r border-sidebar-border
          transition-transform duration-200 ease-in-out
          w-[280px] shrink-0
          ${isOpen ? "translate-x-0" : "-translate-x-full md:-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-sidebar-border">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Link>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md hover:bg-sidebar-accent text-sidebar-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        {/* Chat list */}
        <div className="flex-1 overflow-y-auto py-2">
          {chats.length === 0 ? (
            <p className="px-3 py-6 text-sm text-sidebar-foreground/50 text-center">
              No chats yet
            </p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`
                  group flex items-center gap-2 mx-2 rounded-md
                  ${
                    activeChatId === chat.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                  }
                `}
              >
                <Link
                  href={`/chat/${chat.id}`}
                  className="flex-1 min-w-0 px-3 py-2"
                >
                  <div className="truncate text-sm">{chat.title}</div>
                  <div className="text-xs text-sidebar-foreground/50">
                    {timeAgo(chat.updatedAt)}
                  </div>
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
