/**
 * The gradients the critter and memory scenes draw under their content (the design's inline
 * values): photo fades, the dusk wash an encounter stands on where the camera can't run, and the
 * yellow glow behind the guide.
 */
/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- gradients and colours the premium tokens do not carry yet */
export const SCRIM = {
  heroTop: 'linear-gradient(180deg, rgba(10,15,25,.5) 0%, rgba(10,15,25,0) 40%)',
  dusk: 'linear-gradient(180deg, #3b4a44 0%, #2a2622 60%, #1a1714 100%)',
  encounter:
    'linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.05) 30%, rgba(0,0,0,.2) 50%, rgba(0,0,0,.85) 100%)',
  wanderedLight: 'linear-gradient(180deg, rgba(245,245,247,0) 0%, rgba(245,245,247,1) 72%)',
  wanderedDark: 'linear-gradient(180deg, rgba(14,15,19,0) 0%, rgba(14,15,19,1) 72%)',
  memory:
    'linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.05) 35%, rgba(0,0,0,.25) 60%, rgba(0,0,0,.85) 100%)',
  photoBottom: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.55) 100%)',
  xpFill: 'linear-gradient(90deg, #ffd84a, #ff9a4d)',
  dots: 'radial-gradient(rgba(23,20,42,.12) 1.2px, transparent 1.7px)',
} as const;

/** Clear glass over photos (the design's lighter photo buttons snap to the kit's clear glass). */
export const CLEAR_GLASS = 'rgba(18,20,28,.30)';
export const ON_PHOTO = '#ffffff';
export const ON_PHOTO_SOFT = 'rgba(255,255,255,.92)';
export const ON_PHOTO_MUTED = 'rgba(255,255,255,.75)';
/** The sun rays behind a befriended critter. */
export const SUN_RAYS = 'rgba(255,216,74,.32)';
/** The soft shadow under a critter standing on a photo. */
export const PHOTO_SHADE = 'rgba(0,0,0,.35)';
/** The hold ring's track on a photo. */
export const HOLD_TRACK = 'rgba(255,255,255,0.25)';
/** The soft blur under a critter's feet. */
export const SHADE_BLUR = 'blur(8px)';
/** The photo washed out behind a critter that wandered off. */
export const WASHED_PHOTO = 'saturate(0.6)';
/** The hatch's mint rays and the egg's shell. */
export const HATCH_PAINT = {
  rays: 'rgba(84,214,164,.25)',
  shell: '#fff1d6',
} as const;

/** A flat ring drawn as a spread shadow. */
export function ring(width: number, color: string): string {
  return `0 0 0 ${width}px ${color}`;
}

/** A gap ring then a coloured ring (a joined member's avatar on a card). */
export function doubleRing(gap: number, gapColor: string, width: number, color: string): string {
  return `${ring(gap, gapColor)}, ${ring(width, color)}`;
}
