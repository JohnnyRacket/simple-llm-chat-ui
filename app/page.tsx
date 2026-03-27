"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContextUsageBar } from "@/components/context-usage-bar";
import { ModelPicker, type ModelInfo } from "@/components/model-picker";
import { ChatSidebar } from "@/components/chat-sidebar";
import { useUser } from "@/components/user-provider";
import { useChatHistory } from "@/hooks/use-chat-history";
import { Send } from "lucide-react";

const PORTS = ["8080", "8081"];

type ServerInfo = {
  contextSize: number;
  modelName: string | null;
  paramsB: number | null;
};

export default function Home() {
  const user = useUser();
  const router = useRouter();
  const { chats, removeChat } = useChatHistory();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedPort, setSelectedPort] = useState("8080");
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
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || sending) return;

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
    [input, sending, selectedPort, router]
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
          <div className="w-full max-w-2xl space-y-4">
            <h2 className="text-2xl font-semibold text-center text-muted-foreground">
              What can I help you with, {user.name}?
            </h2>
            <div>
              <div className="mx-auto max-w-2xl rounded-xl border bg-background shadow-sm">
                <form onSubmit={handleSend}>
                  <div className="flex items-stretch gap-2 p-3">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent px-2 py-1 text-sm text-foreground focus:outline-none"
                      autoFocus
                    />
                    <Button type="submit" className="h-auto px-3" disabled={sending || !input.trim()}>
                      <Send className="h-4 w-4" />
                      <span className="sr-only">Send</span>
                    </Button>
                  </div>
                </form>
                {models.length > 0 && (
                  <div className="border-t px-3 py-2">
                    <ContextUsageBar
                      inputTokens={0}
                      outputTokens={0}
                      contextSize={serverInfo.contextSize}
                      modelPicker={
                        <ModelPicker
                          models={models}
                          selectedPort={selectedPort}
                          onSelect={setSelectedPort}
                        />
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
