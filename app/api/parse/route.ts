import { NextResponse } from "next/server";
import { parseListText, parseListImage, fallbackLineParse } from "@/lib/parse-list";
import { hasClaudeKey } from "@/lib/claude";

export const runtime = "nodejs";

// Accepts multipart form data: either `text` or `file` (image).
// Returns { items: [{item, quantity, unit, notes}], parser: "claude"|"fallback" }
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const text = form.get("text");
    const file = form.get("file");

    if (file instanceof File && file.size > 0) {
      if (!hasClaudeKey()) {
        return NextResponse.json(
          { error: "Photo parsing needs ANTHROPIC_API_KEY in app/.env.local. Paste your list as text instead, or add the key." },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const items = await parseListImage(buf.toString("base64"), file.type || "image/jpeg");
      return NextResponse.json({ items, parser: "claude" });
    }

    if (typeof text === "string" && text.trim()) {
      const useClaude = hasClaudeKey();
      const items = useClaude ? await parseListText(text) : fallbackLineParse(text);
      return NextResponse.json({ items, parser: useClaude ? "claude" : "fallback" });
    }

    return NextResponse.json({ error: "Provide text or a photo." }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
