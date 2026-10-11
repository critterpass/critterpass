/**
 * What a first-launch paste holds, before it is handed to the link resolver: an invite (a crew
 * link or a code goes on to be claimed), or something else, named by where it came from so the page
 * can say "That's a TikTok, not an invite". Nothing here reads the clipboard: it sees only what the
 * person pasted with the system control.
 */
import { normalizeJoinCode } from '@cp/domain';

import { parseIncomingLink } from '@/lib/links/router';

export type PasteSource = 'tiktok' | 'instagram' | 'youtube' | 'maps';

export type PasteKind =
  { readonly kind: 'invite' } | { readonly kind: 'other'; readonly source: PasteSource | null };

const SOURCES: readonly (readonly [RegExp, PasteSource])[] = [
  [/(^|\.)tiktok\.com$/u, 'tiktok'],
  [/(^|\.)instagram\.com$/u, 'instagram'],
  [/(^|\.)(youtube\.com|youtu\.be)$/u, 'youtube'],
  [/(^|\.)(maps\.google\.[a-z.]+|goo\.gl|maps\.app\.goo\.gl|maps\.apple\.com)$/u, 'maps'],
];

function hostOf(text: string): string | null {
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function classifyPaste(text: string): PasteKind {
  const trimmed = text.trim();
  const link = parseIncomingLink(trimmed);
  if (link?.kind === 'invite' || normalizeJoinCode(trimmed) !== null) return { kind: 'invite' };
  const host = hostOf(trimmed);
  const source =
    host === null ? null : (SOURCES.find(([pattern]) => pattern.test(host))?.[1] ?? null);
  return { kind: 'other', source };
}
