/**
 * Audio tags for the guide's recorded voice: a short direction in square brackets (`[excited]`)
 * that the speech model acts on and does not say. Tags are for the voice only. The words shown on
 * screen, stored or spoken on device are always the untagged original; a tagged line is made from
 * it just before synthesis and is used only when taking its tags out gives the original back.
 */

/** The directions a guide may use: warm, light and human; no sound effects, accents or shouting. */
export const VOICE_TAGS: readonly string[] = [
  'excited',
  'cheerfully',
  'warmly',
  'proudly',
  'playfully',
  'mischievously',
  'curious',
  'thoughtful',
  'gently',
  'softly',
  'whispers',
  'chuckles',
  'laughs',
  'sighs',
];

/** At most this many tags in one line, so the delivery stays natural. */
export const VOICE_TAGS_PER_LINE = 3;

const TAG = String.raw`\[[^\[\]\n]{1,40}\]`;
/** A tag before a space, punctuation or the end goes with the space in front of it. */
const TRAILING_TAG = new RegExp(String.raw` ?${TAG}(?=[\s.,!?;:…]|$)`, 'gu');
const LEADING_TAG = new RegExp(String.raw`${TAG} ?`, 'gu');
const tidy = (text: string) => text.trim().replace(/\s+/gu, ' ');

/** The tags written in `text`, without their brackets. */
export function voiceTagsIn(text: string): string[] {
  return [...text.matchAll(new RegExp(TAG, 'gu'))].map((match) => match[0].slice(1, -1).trim());
}

/**
 * `text` without its audio tags. Every short square-bracket group goes, whatever it says, so an
 * editorial bracket such as "[sic]" goes too: only run this over text that was tagged for the
 * voice, never over words meant for the screen.
 */
export function stripVoiceTags(text: string): string {
  return tidy(text.replace(TRAILING_TAG, '').replace(LEADING_TAG, ''));
}

/**
 * `tagged` when it is `original` with a few allowed tags put in and nothing else touched; null
 * otherwise. A line that already has square brackets of its own is never tagged, so its brackets
 * are not mistaken for ours.
 */
export function acceptTaggedLine(original: string, tagged: string): string | null {
  if (original.includes('[') || original.includes(']')) return null;
  const tags = voiceTagsIn(tagged);
  if (tags.length === 0 || tags.length > VOICE_TAGS_PER_LINE) return null;
  if (!tags.every((tag) => VOICE_TAGS.includes(tag))) return null;
  return stripVoiceTags(tagged) === tidy(original) ? tidy(tagged) : null;
}
