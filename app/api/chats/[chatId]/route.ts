import { getUser } from "@/lib/user";
import { deleteChat } from "@/lib/db/chats";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const user = await getUser();
  const { chatId } = await params;
  const deleted = await deleteChat(chatId, user.id);

  if (!deleted) {
    return Response.json({ error: "Chat not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
