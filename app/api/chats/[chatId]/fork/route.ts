import { NextResponse } from "next/server";
import { getUser } from "@/lib/user";
import { forkChat } from "@/lib/db/chats";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const user = await getUser();
  const newChatId = await forkChat(chatId, user.id);

  if (!newChatId) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chatId: newChatId });
}
