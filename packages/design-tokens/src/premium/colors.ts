/**
 * Premium palette (plans/261010-1701-premium-redesign/foundations-spec.md §2), one value per mode.
 * Light values are the Foundations design's inline styles. Dark values come from 1.E's table and its
 * four dark phones (1.10–1.13); the few roles 1.E never draws are derived by the same rule (tint =
 * the accent at about a quarter brightness on black, text = the accent lifted toward white) and are
 * listed in docs/design-system-premium.md §2.
 */

/** A tinted pill or banner: background and the text that sits on it. */
export interface PremiumTint {
  readonly bg: string;
  readonly text: string;
}

/** A stamp's ink: the ring colour and its (slightly darker) lettering. */
export interface PremiumStampInk {
  readonly ring: string;
  readonly text: string;
}

export interface PremiumPalette {
  readonly ink: string;
  readonly inkPressed: string;
  readonly inkSecondary: string;
  readonly muted: string;
  readonly placeholder: string;
  readonly ground: string;
  readonly card: string;
  readonly control: string;
  /** Tiles and controls drawn on a sheet. */
  readonly controlSheet: string;
  readonly controlDisabled: string;
  readonly hairline: string;
  readonly hairlineMenu: string;
  readonly fieldBorder: string;
  readonly outlineEmpty: string;
  readonly segmentTrack: string;
  readonly segmentThumb: string;
  readonly toggleOn: string;
  readonly toggleOff: string;
  readonly toggleKnob: string;
  readonly caret: string;
  /** Text on accent fills (avatars, tags, day badges). Never changes with the mode. */
  readonly onAccent: string;
  /** Text and glyphs on the primary ink pill. */
  readonly onInk: string;
  /** The primary ink pill's vertical gradient, top to bottom. */
  readonly inkFillTop: string;
  readonly inkFillBottom: string;
  /** "2 of 4" segments still to do. */
  readonly progressTodo: string;
  /** Wizard stepper line still to do. */
  readonly stepLine: string;
  readonly skeletonFrom: string;
  readonly skeletonTo: string;
  readonly skeletonBar: string;
  readonly skeletonBarSoft: string;
  /** The ring an avatar in a crew stack wears so overlaps read (the ground colour). */
  readonly stackBorder: string;
  /** The loading spinner's track on the ink pill (its head is `onInk`). */
  readonly spinnerTrack: string;
  /** The glass Undo pill on the ink toast. */
  readonly inkToastAction: string;
  /** The ink toast and offline pill: the one dark (light, in dark mode) bar. */
  readonly inkSurface: string;
  readonly onInkSurface: string;
  /** A disabled icon button's fill (its glyph stays `onInk`). */
  readonly iconButtonDisabled: string;
  readonly status: {
    readonly booked: PremiumTint;
    readonly voteOpen: PremiumTint;
    readonly rain: PremiumTint;
    readonly maybe: PremiumTint;
    readonly unopened: PremiumTint;
    readonly tangerine: PremiumTint;
  };
  readonly banner: {
    readonly guide: PremiumTint;
    readonly info: PremiumTint;
    readonly success: PremiumTint;
    readonly error: PremiumTint;
  };
  /** Speaker tints for a guide note: Tokek's yellow, Pon's tangerine. */
  readonly guideName: string;
  readonly destructive: {
    readonly bg: string;
    readonly text: string;
    readonly listAction: string;
    readonly fieldRing: string;
    readonly helper: string;
  };
  readonly tier: {
    readonly common: string;
    readonly rare: string;
    readonly epic: string;
    readonly locked: string;
    readonly lockedFill: string;
    readonly lockedMark: string;
  };
}

/** Crew colours and stickers: each person keeps one colour everywhere, in both modes. */
export const premiumAccents = {
  sun: '#ffd84a',
  pink: '#ff5fa8',
  sky: '#4f86ff',
  mint: '#54d6a4',
  tangerine: '#ff9a4d',
  paper: '#fffdf6',
  neutral: '#f4efe4',
  /** The sticker's die-cut edge. */
  stickerEdge: '#ffffff',
} as const;

/** Stamps are ink on paper: the same in both modes. */
export const premiumStamps = {
  pink: { ring: '#e0468e', text: '#d6337f' },
  green: { ring: '#2e9a74', text: '#2e9a74' },
  orange: { ring: '#e07a2a', text: '#c45f16' },
} as const satisfies Record<string, PremiumStampInk>;

/** The success check and the offline dot keep their accent in both modes. */
export const premiumSignals = {
  successCheck: '#54d6a4',
  offlineDot: '#ff9a4d',
  /** The light "!" disc on the error toast. */
  errorDisc: '#ff5fa8',
} as const;

export const premiumLight: PremiumPalette = {
  ink: '#1c1d24',
  inkPressed: '#2a2b33',
  inkSecondary: '#3d404c',
  muted: '#6e7180',
  placeholder: '#9a9daa',
  ground: '#f5f5f7',
  card: '#ffffff',
  control: '#f1f1f4',
  controlSheet: '#f1f1f4',
  controlDisabled: '#e9eaee',
  hairline: 'rgba(28,29,36,.08)',
  hairlineMenu: 'rgba(28,29,36,.1)',
  fieldBorder: '#e3e4e9',
  outlineEmpty: '#c4c6ce',
  segmentTrack: 'rgba(118,118,128,.12)',
  segmentThumb: '#ffffff',
  toggleOn: '#34c77b',
  toggleOff: 'rgba(120,120,128,.16)',
  toggleKnob: '#ffffff',
  caret: '#4f86ff',
  onAccent: '#17142a',
  onInk: '#ffffff',
  inkFillTop: '#30313b',
  inkFillBottom: '#16171d',
  progressTodo: '#dcdde3',
  stepLine: '#e3e4e9',
  skeletonFrom: '#e9eaee',
  skeletonTo: '#f5f5f7',
  skeletonBar: '#ececf0',
  skeletonBarSoft: '#f3f3f6',
  stackBorder: '#f5f5f7',
  spinnerTrack: 'rgba(255,255,255,.3)',
  inkToastAction: 'rgba(255,255,255,.14)',
  inkSurface: '#1c1d24',
  onInkSurface: '#ffffff',
  iconButtonDisabled: 'rgba(28,29,36,.35)',
  status: {
    booked: { bg: '#e3f6ec', text: '#1f7a55' },
    voteOpen: { bg: '#ffe4f0', text: '#b0306b' },
    rain: { bg: '#e6eeff', text: '#2f5fc4' },
    maybe: { bg: '#fff3c4', text: '#8a6a0c' },
    unopened: { bg: '#f1f1f4', text: '#6e7180' },
    tangerine: { bg: '#ffe9d6', text: '#a8501a' },
  },
  banner: {
    guide: { bg: '#fff6c9', text: '#3d3210' },
    info: { bg: '#e6eeff', text: '#1d3c80' },
    success: { bg: '#e3f6ec', text: '#174a35' },
    error: { bg: '#ffe4f0', text: '#7a1f48' },
  },
  guideName: '#8a6a0c',
  destructive: {
    bg: '#ffe4f0',
    text: '#b0306b',
    listAction: '#d6337f',
    fieldRing: '#ff5fa8',
    helper: '#b0306b',
  },
  tier: {
    common: '#6e7180',
    rare: '#2f5fc4',
    epic: '#b0306b',
    locked: '#8a6a0c',
    lockedFill: '#efe2b4',
    lockedMark: '#a8800f',
  },
};

export const premiumDark: PremiumPalette = {
  ink: '#f2f2f5',
  inkPressed: '#e2e2e8',
  inkSecondary: '#c3c5cf',
  muted: '#9a9daa',
  placeholder: '#71747f',
  ground: '#0e0f13',
  card: '#1c1d24',
  control: '#2a2b33',
  controlSheet: '#24252d',
  controlDisabled: '#24252d',
  hairline: 'rgba(255,255,255,.09)',
  hairlineMenu: 'rgba(255,255,255,.1)',
  fieldBorder: 'rgba(255,255,255,.09)',
  outlineEmpty: '#3d404c',
  segmentTrack: 'rgba(118,118,128,.24)',
  segmentThumb: '#3d404c',
  toggleOn: '#34c77b',
  toggleOff: 'rgba(120,120,128,.32)',
  toggleKnob: '#1c1d24',
  caret: '#4f86ff',
  onAccent: '#17142a',
  onInk: '#15161b',
  inkFillTop: '#ffffff',
  inkFillBottom: '#e2e2e8',
  progressTodo: '#2a2b33',
  stepLine: '#33343c',
  skeletonFrom: '#24252d',
  skeletonTo: '#2a2b33',
  skeletonBar: '#24252d',
  skeletonBarSoft: '#1f2027',
  stackBorder: '#0e0f13',
  spinnerTrack: 'rgba(21,22,27,.3)',
  inkToastAction: 'rgba(21,22,27,.1)',
  inkSurface: '#f2f2f5',
  onInkSurface: '#15161b',
  iconButtonDisabled: 'rgba(242,242,245,.35)',
  status: {
    booked: { bg: '#16332a', text: '#5fd6a2' },
    voteOpen: { bg: '#3b1a2b', text: '#ff8ac0' },
    rain: { bg: '#142240', text: '#84aaff' },
    maybe: { bg: '#2f2914', text: '#f1e2a6' },
    unopened: { bg: '#2a2b33', text: '#9a9daa' },
    tangerine: { bg: '#3a2516', text: '#ffae73' },
  },
  banner: {
    guide: { bg: '#2f2914', text: '#f1e2a6' },
    info: { bg: '#142240', text: '#84aaff' },
    success: { bg: '#16332a', text: '#5fd6a2' },
    error: { bg: '#3b1a2b', text: '#ff8ac0' },
  },
  guideName: '#ffd84a',
  destructive: {
    bg: '#3b1a2b',
    text: '#ff8ac0',
    listAction: '#ff5fa8',
    fieldRing: '#ff5fa8',
    helper: '#ff8ac0',
  },
  tier: {
    common: '#9a9daa',
    rare: '#84aaff',
    epic: '#ff8ac0',
    locked: '#f1e2a6',
    lockedFill: '#2f2914',
    lockedMark: '#ffd84a',
  },
};
