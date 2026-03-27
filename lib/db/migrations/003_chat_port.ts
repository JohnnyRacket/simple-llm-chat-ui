import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("chats")
    .addColumn("port", "varchar(10)", (col) => col.defaultTo("8080").notNull())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("chats").dropColumn("port").execute();
}
