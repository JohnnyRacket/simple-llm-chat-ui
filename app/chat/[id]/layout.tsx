import { getUser } from "@/lib/user";
import { listChats } from "@/lib/db/chats";
import { ChatShell } from "@/components/chat-shell";

export default async function ChatLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  const chats = await listChats(user.id);

  return (
    <ChatShell
      chats={chats.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      activeChatId={id}
    >
      {children}
    </ChatShell>
  );
}
