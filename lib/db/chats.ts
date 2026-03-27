import db from "./index";

export async function createChatWithMessage(
  userId: string,
  title: string,
  content: string,
  port: string = "8080"
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    const chat = await tx
      .insertInto("chats")
      .values({ user_id: userId, title, port })
      .returning("id")
      .executeTakeFirstOrThrow();

    await tx
      .insertInto("messages")
      .values({ chat_id: chat.id, role: "user", content })
      .execute();

    return chat.id;
  });
}

export async function appendMessage(
  chatId: string,
  role: "user" | "assistant",
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db
    .insertInto("messages")
    .values({
      chat_id: chatId,
      role,
      content,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    })
    .execute();
}

export async function listChats(
  userId: string,
  limit = 50,
  offset = 0
): Promise<Array<{ id: string; title: string; updatedAt: Date }>> {
  const rows = await db
    .selectFrom("chats")
    .select(["id", "title", "updated_at"])
    .where("user_id", "=", userId)
    .orderBy("updated_at", "desc")
    .limit(limit)
    .offset(offset)
    .execute();

  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export async function loadMessages(
  chatId: string,
  userId: string
): Promise<
  Array<{
    id: string;
    role: string;
    content: string;
    parts: Array<{ type: "text"; text: string }>;
    metadata: Record<string, unknown>;
    createdAt: Date;
  }>
> {
  const rows = await db
    .selectFrom("messages")
    .innerJoin("chats", "chats.id", "messages.chat_id")
    .select([
      "messages.id",
      "messages.role",
      "messages.content",
      "messages.metadata",
      "messages.created_at",
    ])
    .where("messages.chat_id", "=", chatId)
    .where("chats.user_id", "=", userId)
    .orderBy("messages.created_at", "asc")
    .execute();

  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    parts: [{ type: "text" as const, text: r.content }],
    metadata: r.metadata as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

export async function touchChat(chatId: string): Promise<void> {
  await db
    .updateTable("chats")
    .set({ updated_at: new Date() })
    .where("id", "=", chatId)
    .execute();
}

export async function setActiveStreamId(
  chatId: string,
  streamId: string
): Promise<void> {
  await db
    .updateTable("chats")
    .set({ active_stream_id: streamId })
    .where("id", "=", chatId)
    .execute();
}

export async function clearActiveStreamId(chatId: string): Promise<void> {
  await db
    .updateTable("chats")
    .set({ active_stream_id: null })
    .where("id", "=", chatId)
    .execute();
}

export async function getActiveStreamId(
  chatId: string,
  userId: string
): Promise<string | null> {
  const row = await db
    .selectFrom("chats")
    .select("active_stream_id")
    .where("id", "=", chatId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return row?.active_stream_id ?? null;
}

export async function forkChat(
  chatId: string,
  userId: string
): Promise<string | null> {
  return db.transaction().execute(async (tx) => {
    const source = await tx
      .selectFrom("chats")
      .select(["id", "title", "port"])
      .where("id", "=", chatId)
      .where("user_id", "=", userId)
      .executeTakeFirst();

    if (!source) return null;

    const newChat = await tx
      .insertInto("chats")
      .values({ user_id: userId, title: `Fork of ${source.title}`, port: source.port })
      .returning("id")
      .executeTakeFirstOrThrow();

    const messages = await tx
      .selectFrom("messages")
      .select(["role", "content", "metadata"])
      .where("chat_id", "=", chatId)
      .orderBy("created_at", "asc")
      .execute();

    if (messages.length > 0) {
      await tx
        .insertInto("messages")
        .values(
          messages.map((m) => ({
            chat_id: newChat.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata ? JSON.stringify(m.metadata) : undefined,
          }))
        )
        .execute();
    }

    return newChat.id;
  });
}

export async function getChatPort(
  chatId: string,
  userId: string
): Promise<string> {
  const row = await db
    .selectFrom("chats")
    .select("port")
    .where("id", "=", chatId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return row?.port ?? "8080";
}

export async function deleteChat(
  chatId: string,
  userId: string
): Promise<boolean> {
  const result = await db
    .deleteFrom("chats")
    .where("id", "=", chatId)
    .where("user_id", "=", userId)
    .executeTakeFirst();

  return Number(result.numDeletedRows) > 0;
}
