import { redirect } from "next/navigation";
import { getUser } from "@/lib/user";
import { loadMessages } from "@/lib/db/chats";
import { ChatView } from "./chat-view";
import type { UIMessage } from "ai";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const dbMessages = await loadMessages(id, user.id);

  if (dbMessages.length === 0) {
    redirect("/");
  }

  const initialMessages: UIMessage[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    parts: m.parts,
    metadata: m.metadata,
    createdAt: m.createdAt,
  }));

  return <ChatView chatId={id} initialMessages={initialMessages} />;
}
