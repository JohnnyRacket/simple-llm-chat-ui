import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("chats")
    .addColumn("active_stream_id", "varchar(255)")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("chats")
    .dropColumn("active_stream_id")
    .execute();
}
