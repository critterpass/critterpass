/**
 * The few printed colours and timings the premium onboarding pages need that the premium tokens
 * do not carry: the pass paper's own inks (a printed document, the same in both modes), the warm
 * tint of a picked row on paper, the sheet scrim, the cover's sun-ink frame, Google's brand
 * colours (their button rules require the multicolour "G"), and the shake and impact beats.
 */
/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- printed and brand colours the premium tokens do not carry */

export const PAPER_INK = {
  label: '#5d564b',
  pending: '#b0a890',
  slot: '#d6ccb6',
  slotMark: '#c4b99f',
} as const;

/** A picked row on paper (home base, the newcomer on the manifest), light mode only. */
export const PICKED_ROW = '#fffbe8';

/** The page dimmed behind a drawn sheet. */
export const SHEET_SCRIM = 'rgba(20,22,40,0.28)';

/** The passport cover's frame line. */
export const COVER_FRAME = 'rgba(255,216,74,0.6)';

/** Google's brand colours, in the order of the "G"'s paths (top, right, left, bottom). */
export const GOOGLE_COLOURS = ['#EA4335', '#4285F4', '#FBBC05', '#34A853'] as const;

/** One leg of the wrong-code shake (3 cycles, ±6). */
export const SHAKE_LEG_MS = 50;
/** A stamp's fade-in as it starts to fall, and its squash at impact. */
export const STAMP_APPEAR_MS = 80;
export const STAMP_SQUASH_MS = 60;

/** The returning passport (2.02): navy cover, gold ink, a soft drop, and the sun-lit ground. */
export const NAVY_PASS = {
  cover: 'linear-gradient(160deg, #2a2f5a, #1f2a52)',
  gold: '#e9c77a',
  shadow: 'inset 0 0 0 6px rgba(0,0,0,0.18), 0 30px 50px -20px rgba(0,0,0,0.5)',
  ground: (ground: string) => `radial-gradient(120% 70% at 50% 30%, #fff6c9 0%, ${ground} 62%)`,
} as const;
