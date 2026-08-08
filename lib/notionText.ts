/**
 * lib/notionText.ts
 * Safe read/write helpers for Notion rich_text and title properties.
 *
 * WHY THIS EXISTS
 * Notion caps a single text object at 2000 characters. Longer values must be
 * written as SEVERAL objects in the property's array, and Notion likewise splits
 * on read (also at annotation boundaries when a human edits the page in Notion).
 *
 * Reading `rich_text[0].plain_text` — the pattern this codebase used everywhere —
 * therefore silently truncates any long value to its first fragment, and writing
 * a >2000-char string as one object makes the API reject the whole request.
 * That combination is what made completed meeting notes unreadable: long notes
 * either failed to save, or saved and came back as an opening sentence.
 *
 * Use `readRichText` / `readTitle` on every read, and `toRichText` on every
 * write of a field that can hold free text.
 */

/** Notion's hard per-text-object limit. */
const MAX_CHARS_PER_CHUNK = 2000;
/** Leave headroom so multi-byte characters can't push a chunk over the limit. */
const CHUNK = 1900;
/** Notion also caps the array itself at 100 elements. */
const MAX_CHUNKS = 100;

/** Largest string that survives a round-trip through one Notion property. */
export const MAX_RICH_TEXT_CHARS = CHUNK * MAX_CHUNKS;

type TextRun = { plain_text?: string };

/**
 * Read a rich_text property, joining EVERY chunk.
 * Returns '' for a missing property or one of a different type.
 */
export function readRichText(prop: unknown): string {
  const v = prop as { type?: string; rich_text?: TextRun[] } | undefined;
  if (v?.type !== 'rich_text' || !Array.isArray(v.rich_text)) return '';
  return v.rich_text.map(r => r?.plain_text ?? '').join('');
}

/** Read a title property, joining EVERY chunk. */
export function readTitle(prop: unknown): string {
  const v = prop as { type?: string; title?: TextRun[] } | undefined;
  if (v?.type !== 'title' || !Array.isArray(v.title)) return '';
  return v.title.map(r => r?.plain_text ?? '').join('');
}

/**
 * Split a string into Notion-sized text objects for a rich_text write.
 *
 * An empty string yields `[]`, which Notion accepts as "clear this property".
 * Anything beyond MAX_RICH_TEXT_CHARS is truncated with a visible marker rather
 * than throwing — losing the tail of a very long transcript is bad, but failing
 * the whole meeting save is worse.
 */
export function toRichText(s: string | null | undefined): { text: { content: string } }[] {
  const str = s ?? '';
  if (!str) return [];

  const capped = str.length > MAX_RICH_TEXT_CHARS
    ? str.slice(0, MAX_RICH_TEXT_CHARS - 20) + '\n…[truncated]'
    : str;

  const chunks: { text: { content: string } }[] = [];
  for (let i = 0; i < capped.length; i += CHUNK) {
    chunks.push({ text: { content: capped.slice(i, i + CHUNK) } });
  }
  return chunks;
}

/** True when a value is short enough to sit in a single Notion text object. */
export function fitsOneChunk(s: string): boolean {
  return s.length <= MAX_CHARS_PER_CHUNK;
}
