/**
 * A guide's line as it is shown. A local word's gloss can arrive with a second pair of brackets
 * inside the first ("terima kasih (thank you (Indonesian))", or the same pair twice): brackets in
 * brackets read as a typo, so the inner pair becomes a comma ("terima kasih (thank you,
 * Indonesian)"). It reads left to right, so an answer still streaming in tidies the same way and
 * no shown character changes as the rest arrives.
 */
const OPEN = '(';
const CLOSE = ')';

export function tidyGuideText(text: string): string {
  if (!text.includes(OPEN)) return text;
  let out = '';
  let depth = 0;
  // An inner pair just closed: whatever follows inside the outer pair is set off by a comma.
  let innerClosed = false;
  for (const char of text) {
    if (char === OPEN) {
      depth += 1;
      if (depth > 1) {
        out = out.trimEnd();
        if (!out.endsWith(OPEN) && !out.endsWith(',')) out += ',';
        if (!out.endsWith(OPEN)) out += ' ';
        innerClosed = false;
        continue;
      }
    } else if (char === CLOSE) {
      if (depth > 1) {
        depth -= 1;
        innerClosed = true;
        continue;
      }
      depth = Math.max(0, depth - 1);
      innerClosed = false;
    } else if (innerClosed) {
      if (/[\p{L}\p{N}]/u.test(char)) {
        out = `${out.trimEnd()}, `;
        innerClosed = false;
      } else if (!/\s/u.test(char)) {
        innerClosed = false;
      }
    }
    out += char;
  }
  return out;
}
