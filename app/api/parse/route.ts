import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const { LiteParse } = await import("@llamaindex/liteparse");
  const parser = new LiteParse({ outputFormat: "text" });
  const result = await parser.parse(buffer);

  return NextResponse.json({
    filename: file.name,
    text: result.text,
    pageCount: result.pages.length,
  });
}
