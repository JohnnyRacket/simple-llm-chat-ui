import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./types";

function createDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
      }),
    }),
  });
}

declare global {
  // eslint-disable-next-line no-var
  var _db: Kysely<Database> | undefined;
}

const db: Kysely<Database> =
  process.env.NODE_ENV === "production"
    ? createDb()
    : (globalThis._db ??= createDb());

export default db;
