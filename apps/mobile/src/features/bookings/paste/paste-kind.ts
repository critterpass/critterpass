/**
 * What a paste becomes: a single http(s) link is sent as a link (the server fetches it once, only
 * from booking sites it trusts); anything else (a confirmation code, the email's text) as text.
 */
import type { ImportPastePayload } from '@cp/domain';

export const PASTE_MAX = 20_000;

export type PasteBody = Pick<ImportPastePayload, 'text' | 'url'>;

export function pasteBody(raw: string): PasteBody | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/\s/u.test(text) && /^https?:\/\//iu.test(text)) {
    try {
      const url = new URL(text);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && text.length <= 2000) {
        return { url: url.toString() };
      }
    } catch {
      // Not a link after all: read it as text.
    }
  }
  return { text: text.slice(0, PASTE_MAX) };
}
