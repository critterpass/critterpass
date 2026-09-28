/**
 * Send-side rules for crew chat (docs/api-contracts.md §4.2): body length, attachment counts and
 * shapes, and link safety. Shared by the api handlers and the app composer so both refuse the same
 * message for the same reason.
 */

export const MESSAGE_BODY_MAX = 4000;
export const MESSAGE_ATTACHMENTS_MAX = 10;
export const MESSAGE_MENTIONS_MAX = 16;
/** Voice notes are capped at two minutes. */
export const VOICE_NOTE_MAX_MS = 120_000;
/** Default edit window when `chat.edit_window_minutes` is not configured. */
export const CHAT_EDIT_WINDOW_MINUTES = 15;
/** How many quick reactions the long-press bar offers. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '🙏'] as const;

const SCHEME = /\b([a-z][a-z0-9+.-]{1,31}):(\/\/)?/gi;
/** Schemes that run code or read local data when tapped, with or without `//`. */
const DANGEROUS_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'file', 'blob', 'intent']);
const SAFE_SCHEMES = new Set(['http', 'https']);

/**
 * The first link in `body` a crewmate should never be able to tap: any `scheme://` other than
 * http/https, or a script/data/file scheme with or without slashes. `null` when every link is safe.
 */
export function findUnsafeLink(body: string): string | null {
  for (const match of body.matchAll(SCHEME)) {
    const scheme = (match[1] ?? '').toLowerCase();
    if (SAFE_SCHEMES.has(scheme)) continue;
    if (DANGEROUS_SCHEMES.has(scheme) || match[2] !== undefined) return scheme;
  }
  return null;
}

/** `@name` tokens are resolved by the composer; here the text only needs a stable trim. */
export function normaliseBody(body: string): string {
  return body.replace(/\r\n?/g, '\n').trim();
}

/** Whether an emoji key is one visible grapheme-ish token (no spaces, no plain text). */
export function isReactionEmoji(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 16 &&
    !/\s/u.test(value) &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)
  );
}
