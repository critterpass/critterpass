/* eslint-disable lingui/no-unlocalized-strings -- shadow and gradient values the premium tokens do not carry yet */
/** The guide thread's paint the premium tokens do not carry yet. */
export const GUIDE_PAINT = {
  /** The halo round the quota chip's sun dot. */
  quotaHalo: '0 0 0 2px rgba(255,216,74,.35)',
} as const;

/** The kit's flat ring, here beside the other paint. */
export { ring } from '@/ui/premium';

/** Phrase show mode's warm glow over ink. */
export const PHRASE_PAINT = {
  glow: 'radial-gradient(circle at 50% 40%, rgba(255,216,74,.18), transparent 60%)',
} as const;
