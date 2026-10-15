/**
 * The colours and timings the Pass+ and boost pages draw that the premium token group doesn't
 * carry yet: the Pass+ night (a fixed themed surface in both modes), the passport paper's muted
 * ink, the first-trip-free blue, Pon's tinted disc, the newcomer's lilac and the 1.07 / ambient
 * timings. Each is the design's own value; the kit lane promotes them to `premium.*` tokens.
 */
/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- the design's values, pending a premium token group. */

export const NIGHT = {
  top: '#332e5e',
  mid: '#17142a',
  bottom: '#100e1e',
  gold: '#ffe48a',
  sun: '#ffd84a',
  text: '#ffffff',
  textSoft: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.55)',
  textFaint: 'rgba(255,255,255,0.3)',
  glass: 'rgba(255,255,255,0.08)',
  hairline: 'rgba(255,255,255,0.1)',
  boostText: '#ff8fbf',
  selectedFill: 'rgba(255,216,74,0.12)',
} as const;

export const PAPER = {
  muted: '#7a7264',
  /** A stamp's paper showing through its middle. */
  showThrough: 'rgba(255,253,246,0.7)',
  showThroughStrong: 'rgba(255,253,246,0.92)',
  /** The stamp's pink ink on its cream paper, the same in both looks (the paper never darkens). */
  stampInk: '#b0306b',
} as const;

export const MONETIZE_INK = {
  /** The guide's warm voice on paper (9.14). */
  guideOnPaper: '#8a4a12',
  /** Pon's tangerine disc behind a small Pon. */
  ponDisc: '#ffe9d6',
  /** The Pass+ column's band in What's in each (light; dark uses `passBandDark`). */
  passBand: '#fff3b8',
  passBandDark: 'rgba(255,243,184,0.12)',
  lilac: '#c9b8ff',
  lilacInk: '#6b5cc4',
  lilacBg: '#f5f2ff',
  scrim: 'rgba(20,22,40,0.28)',
  /** A store card's chip and its printed name. */
  cardChip: '#e2a92a',
  cardText: 'rgba(255,255,255,0.85)',
  /** The split-flap tile: top half, bottom half, seam. */
  flapTop: '#2a2b33',
  flapBottom: '#1c1d24',
  flapSeam: '#0b0b0d',
  /** A month the plan stays on (9.23 bars). */
  monthOn: '#1c1d24',
} as const;

export const MONETIZE_TIMING = {
  instant: 0,
  stampAppear: 80,
  sheetFadeIn: 240,
  sheetFadeOut: 220,
  inkRing: 810,
  confetti: 1500,
  lockSpin: 1400,
  livePulse: 1600,
  newcomerBob: 900,
  holoTurn: 10_000,
} as const;
