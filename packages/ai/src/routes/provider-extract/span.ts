/** Finding the model's quoted words in the message a traveller shared. */
import type { SourceSpan } from '@cp/domain';

const fold = (text: string) => text.toLowerCase().replace(/\s+/gu, ' ');

const ELLIPSIS = /\s*(?:\.{3,}|…)\s*/u;

/**
 * Where `quote` is in `source` (case and spacing ignored), or null when it is not. A quote the
 * model shortened with "..." is found when every piece is there, in order; its span runs from the
 * first piece to the last.
 */
export function spanOf(source: string, quote: string): SourceSpan | null {
  const pieces = quote
    .split(ELLIPSIS)
    .map((piece) => fold(piece.trim()))
    .filter((piece) => piece !== '');
  if (pieces.length === 0) return null;
  // Map folded offsets back to the source: fold keeps one char per source char except runs of space.
  const map: number[] = [];
  let folded = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] as string;
    if (/\s/u.test(ch)) {
      if (folded.endsWith(' ')) continue;
      folded += ' ';
    } else {
      folded += ch.toLowerCase();
    }
    map.push(i);
  }
  let from = 0;
  let start = -1;
  for (const piece of pieces) {
    const at = folded.indexOf(piece, from);
    if (at < 0) return null;
    if (start < 0) start = at;
    from = at + piece.length;
  }
  const end = map[from - 1];
  return [map[start] as number, (end ?? source.length - 1) + 1];
}
