import type { ColumnType, Generated } from "kysely";

export interface UsersTable {
  id: Generated<string>;
  external_id: string;
  email: string;
  name: string;
  groups: string[];
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ChatsTable {
  id: Generated<string>;
  user_id: string;
  title: string;
  active_stream_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface MessagesTable {
  id: Generated<string>;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  chats: ChatsTable;
  messages: MessagesTable;
}
