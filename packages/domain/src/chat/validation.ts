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
/** The doodle reactions of the long-press bar: heart, star, flame, check and spark, stored as emoji. */
export const DOODLE_REACTIONS = ['❤️', '⭐', '🔥', '✅', '✨'] as const;

/** Poses a critter reaction can wear (the sticker poses plus the resting one). */
const CRITTER_REACTION = /^c([1-9]\d{0,2})\.(idle|wave|cheer|think|point|sleep)$/u;

/** A critter reaction key: `c<dex no>.<pose>`, for example `c112.cheer` (at most 16 characters). */
export function critterReactionKey(no: number, pose: string): string {
  return `c${no}.${pose}`;
}

/** The dex number and pose of a critter reaction key, or null for an emoji or anything else. */
export function parseCritterReaction(value: string): { no: number; pose: string } | null {
  const match = CRITTER_REACTION.exec(value);
  if (match === null) return null;
  return { no: Number(match[1]), pose: match[2] ?? 'idle' };
}

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

/** What a reaction may be: one emoji, or a critter of the dex in a pose (`c112.cheer`). */
export function isReactionKey(value: string): boolean {
  return isReactionEmoji(value) || parseCritterReaction(value) !== null;
}
