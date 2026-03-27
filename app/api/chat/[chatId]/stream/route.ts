import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { getUser } from "@/lib/user";
import { getActiveStreamId } from "@/lib/db/chats";
import { streamContext } from "@/lib/stream";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const user = await getUser();

  const activeStreamId = await getActiveStreamId(chatId, user.id);

  if (!activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const stream = await streamContext.resumeExistingStream(activeStreamId);

  if (!stream) {
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
