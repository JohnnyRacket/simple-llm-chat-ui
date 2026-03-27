import { promises as fs } from "fs";
import { Kysely, Migrator, FileMigrationProvider, PostgresDialect } from "kysely";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1,
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`✓ ${it.migrationName}`);
    } else if (it.status === "Error") {
      console.error(`✗ ${it.migrationName}`);
    }
  });

  if (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  if (!results?.length) {
    console.log("No pending migrations.");
  }

  await db.destroy();
}

migrate();
