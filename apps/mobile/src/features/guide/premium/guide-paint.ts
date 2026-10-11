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

/** Voice mode's sun glow behind the listening guide. */
export const VOICE_PAINT = {
  glow: 'radial-gradient(circle at 50% 30%, rgba(255,216,74,.32), transparent 58%)',
} as const;

/** Point and ask: the camera's dark ground and the shadow under each menu label. */
export const MENU_PAINT = {
  ground: 'radial-gradient(circle at 40% 30%, #4a4038, #221e1a 70%)',
  labelShadow: '0 4px 10px rgba(0,0,0,.3)',
} as const;
