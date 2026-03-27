import { getUser } from "@/lib/user";
import { loadMessages } from "@/lib/db/chats";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getUser();
  const { chatId } = await params;
  const messages = await loadMessages(chatId, user.id);

  if (messages.length === 0) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json(messages);
}
