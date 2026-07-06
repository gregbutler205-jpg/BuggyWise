/**
 * Extracts plain text from Word documents so they can flow through the same
 * text-parsing pipeline (lib/parse-list.ts's parseListText) used for pasted
 * text — unlike PDFs/images, Claude's API has no native "read a .doc(x)"
 * content block, so the text has to be pulled out here first.
 */
import mammoth from "mammoth";
import WordExtractor from "word-extractor";

export const DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const DOC_MEDIA_TYPE = "application/msword";

export function isWordDoc(mediaType: string): boolean {
  return mediaType === DOCX_MEDIA_TYPE || mediaType === DOC_MEDIA_TYPE;
}

export async function extractTextFromDoc(buffer: Buffer, mediaType: string): Promise<string> {
  const text =
    mediaType === DOCX_MEDIA_TYPE
      ? (await mammoth.extractRawText({ buffer })).value
      : (await new WordExtractor().extract(buffer)).getBody();

  if (!text.trim()) {
    throw new Error("Couldn't find any readable text in that document — try saving it as a PDF instead.");
  }
  return text;
}
