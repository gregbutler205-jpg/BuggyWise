import { NextResponse } from "next/server";
import { parseListText, parseListImage, fallbackLineParse } from "@/lib/parse-list";
import { hasClaudeKey } from "@/lib/claude";
import { extractTextFromDoc, isWordDoc, DOCX_MEDIA_TYPE, DOC_MEDIA_TYPE } from "@/lib/doc-extract";

export const runtime = "nodejs";

// Claude reads these natively via image/document content blocks.
const IMAGE_OR_PDF_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);

// Some browsers/OSes report a generic or blank MIME type for older .doc
// files — fall back to the file extension so those aren't rejected.
function resolveFileType(file: File): string {
  if (IMAGE_OR_PDF_TYPES.has(file.type) || isWordDoc(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return DOCX_MEDIA_TYPE;
  if (name.endsWith(".doc")) return DOC_MEDIA_TYPE;
  return file.type;
}

// Accepts multipart form data: either `text` or `file` (image, PDF, or Word doc).
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
      const fileType = resolveFileType(file);
      const buf = Buffer.from(await file.arrayBuffer());

      if (isWordDoc(fileType)) {
        const docText = await extractTextFromDoc(buf, fileType);
        const items = await parseListText(docText);
        return NextResponse.json({ items, parser: "claude" });
      }
      if (!IMAGE_OR_PDF_TYPES.has(fileType)) {
        return NextResponse.json(
          {
            error: `Unsupported file type "${fileType || "unknown"}". Use a photo (JPEG/PNG/GIF/WEBP), a PDF, or a Word doc (.doc/.docx), or paste the list as text instead.`,
          },
          { status: 400 }
        );
      }
      const items = await parseListImage(buf.toString("base64"), fileType);
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
