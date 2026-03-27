import { headers } from "next/headers";
import db from "@/lib/db";

export type User = {
  id: string;
  externalId: string;
  email: string;
  name: string;
  groups: string[];
};

const DEV_USER = {
  externalId: "dev",
  email: "dev@localhost",
  name: "Developer",
  groups: [] as string[],
};

function parseHeaders(h: Headers) {
  const externalId = h.get("Remote-User");
  if (!externalId) return null;

  return {
    externalId,
    email: h.get("Remote-Email") ?? "",
    name: h.get("Remote-Name") ?? externalId,
    groups:
      h
        .get("Remote-Groups")
        ?.split(",")
        .map((g) => g.trim())
        .filter(Boolean) ?? [],
  };
}

async function upsertUser(data: {
  externalId: string;
  email: string;
  name: string;
  groups: string[];
}): Promise<User> {
  const row = await db
    .insertInto("users")
    .values({
      external_id: data.externalId,
      email: data.email,
      name: data.name,
      groups: data.groups,
    })
    .onConflict((oc) =>
      oc.column("external_id").doUpdateSet({
        email: data.email,
        name: data.name,
        groups: data.groups,
        updated_at: new Date(),
      })
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    id: row.id,
    externalId: row.external_id,
    email: row.email,
    name: row.name,
    groups: row.groups,
  };
}

export async function getUser(): Promise<User> {
  const h = await headers();
  const parsed = parseHeaders(h);
  return upsertUser(parsed ?? DEV_USER);
}
