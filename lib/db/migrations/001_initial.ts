import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("external_id", "varchar", (col) => col.notNull().unique())
    .addColumn("email", "varchar", (col) => col.notNull())
    .addColumn("name", "varchar", (col) => col.notNull())
    .addColumn("groups", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("chats")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("user_id", "uuid", (col) =>
      col.notNull().references("users.id").onDelete("cascade")
    )
    .addColumn("title", "varchar", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createTable("messages")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("chat_id", "uuid", (col) =>
      col.notNull().references("chats.id").onDelete("cascade")
    )
    .addColumn("role", "varchar", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("metadata", "jsonb", (col) => col.defaultTo(sql`'{}'`))
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`)
    )
    .execute();

  await db.schema
    .createIndex("idx_chats_user_id")
    .on("chats")
    .column("user_id")
    .execute();

  await db.schema
    .createIndex("idx_messages_chat_id_created_at")
    .on("messages")
    .columns(["chat_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("messages").execute();
  await db.schema.dropTable("chats").execute();
  await db.schema.dropTable("users").execute();
}
