import { NextResponse } from "next/server";
import { generateText } from "ai";
import { getUser } from "@/lib/user";
import { loadMessages, getChatPort, compactForkChat } from "@/lib/db/chats";
import { createLLM } from "@/lib/llm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const user = await getUser();

  const messages = await loadMessages(chatId, user.id);
  if (!messages.length) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  const port = await getChatPort(chatId, user.id);
  const llm = createLLM(port);

  const convoText = messages
    .map((m) => {
      const text = m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");
      return `${m.role === "user" ? "User" : "Assistant"}: ${text}`;
    })
    .join("\n\n");

  const { text: compactedSummary } = await generateText({
    model: llm("model"),
    system:
      "You are a conversation summarizer. Produce a compact but complete summary of this conversation " +
      "that can serve as starting context for continuing the discussion. You MUST preserve: " +
      "the original question or request, all key decisions made, all important conclusions and outcomes, " +
      "any code/configurations/commands produced, and the current state of any ongoing work. " +
      "Write in first person as the assistant. Be dense and precise. Omit pleasantries and filler. " +
      "This summary replaces the full history so it must be self-contained.",
    messages: [{ role: "user", content: `Compact this conversation:\n\n${convoText}` }],
  });

  const newChatId = await compactForkChat(chatId, user.id, compactedSummary);
  if (!newChatId) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 });
  }

  return NextResponse.json({ chatId: newChatId });
}
