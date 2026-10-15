/**
 * Where what was typed sits in a result's name, for the bold part of a search row: anywhere in the
 * name (not only at its start: "Fes el Bali"), ignoring case and accents ("bali" in "Balıkesir",
 * "da lat" in "Đà Lạt"). Null when it isn't there.
 */
const FOLDS: Readonly<Record<string, string>> = { ı: 'i', İ: 'i', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l' };

function foldChar(char: string): string {
  const mapped = FOLDS[char];
  if (mapped !== undefined) return mapped;
  return char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function matchSpan(
  name: string,
  typed: string,
): { readonly start: number; readonly end: number } | null {
  const needle = [...typed.trim()].map(foldChar).join('');
  if (needle === '') return null;
  // The folded name, and for each folded character where its original character starts and ends.
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const char of name) {
    const piece = foldChar(char);
    for (let i = 0; i < piece.length; i += 1) {
      starts.push(at);
      ends.push(at + char.length);
    }
    folded += piece;
    at += char.length;
  }
  const index = folded.indexOf(needle);
  if (index === -1) return null;
  return { start: starts[index] ?? 0, end: ends[index + needle.length - 1] ?? name.length };
}
