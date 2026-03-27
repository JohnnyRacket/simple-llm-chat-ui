import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { getUser } from "@/lib/user";
import { getActiveStreamId, clearActiveStreamId } from "@/lib/db/chats";
import { streamContext } from "@/lib/stream";
import { getAbort, removeAbort } from "@/lib/abort-registry";
import db from "@/lib/db";

async function resolveStream(
  params: Promise<{ chatId: string }>
): Promise<ReadableStream | null> {
  const { chatId } = await params;
  const user = await getUser();

  const activeStreamId = await getActiveStreamId(chatId, user.id);

  if (!activeStreamId) {
    return null;
  }

  const stream = await streamContext.resumeExistingStream(activeStreamId);

  if (!stream) {
    return null;
  }

  return stream;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const stream = await resolveStream(params);

  if (!stream) {
    return new Response(null, { status: 204 });
  }

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}

export async function HEAD(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const stream = await resolveStream(params);

  return new Response(null, { status: stream ? 200 : 204 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const user = await getUser();

  const chat = await db
    .selectFrom("chats")
    .select("id")
    .where("id", "=", chatId)
    .where("user_id", "=", user.id)
    .executeTakeFirst();

  if (!chat) {
    return new Response(null, { status: 404 });
  }

  getAbort(chatId)?.abort();
  removeAbort(chatId);
  await clearActiveStreamId(chatId);

  return new Response(null, { status: 204 });
}
