import { getUser } from "@/lib/user";
import { listChats } from "@/lib/db/chats";

export async function GET(req: Request) {
  const user = await getUser();
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  const chats = await listChats(user.id, limit, offset);
  return Response.json(chats);
}
