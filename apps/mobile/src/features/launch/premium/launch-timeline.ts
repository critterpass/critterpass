/**
 * The first-launch stamp (10.02) as data: times on the design's clock, geometry in the design
 * phone's points (390 × 844), placed around the screen centre like the native launch screen, which
 * centres the same cover on the same glow. The app starts the clock 200 ms before the stamp drops,
 * skipping the design loop's opening hold.
 */
/** The design phone the positions below are measured on. */
export const DESIGN_PHONE = { width: 390, height: 844 } as const;

/** Design time (ms) at which the app's clock starts: 200 ms before the stamp appears. */
export const LAUNCH_CLOCK_START = 808;

/** Design times (ms) of every beat. */
export const BEATS = {
  stampDrop: 1008,
  stampHit: 1568,
  squashStart: 1120,
  squashDeep: 1624,
  squashEnd: 1960,
  lift: 3024,
  liftEnd: 3808,
  tokek: 3696,
  plane: 3920,
  puffin: 4032,
  /** 2.01's headline, ink pill and text button rise from here (the welcome screen draws them). */
  footer: 3920,
  settled: 4480,
} as const;

export type Beat = keyof typeof BEATS;

/** Milliseconds after the app's clock starts at which `beat` happens. */
export function beatAt(beat: Beat): number {
  return BEATS[beat] - LAUNCH_CLOCK_START;
}

/** The launch cover, centred on the screen; its image carries an 80 pt margin for the shadow. */
export const COVER = { width: 200, height: 262, imagePad: 80 } as const;
/** The glow behind it: a 736 pt square centred on the screen (the native launch image's size). */
export const GLOW_SIZE = 736;
/** Where the cover lifts to as the welcome arrives. */
export const COVER_LIFT = { translateY: -176, scale: 0.72, rotate: -5 } as const;

/** The ISSUED stamp, positioned inside the cover. */
export const STAMP = {
  size: 112,
  /** Ring widths: 3.5 pt at the edge, 1.5 pt starting 8 pt in. */
  outerRing: 3.5,
  innerRing: 1.5,
  innerRingInset: 8,
  left: 104,
  top: 150,
  from: { translateY: -90, scale: 2.2, rotate: -34 },
  impact: { scaleX: 0.9, scaleY: 0.84 },
  rotate: -14,
} as const;

/** The squash the cover takes as the stamp hits. */
export const COVER_SQUASH = { translateY: 4, scaleX: 1.03, scaleY: 0.96 } as const;

export type LaunchStickerName = 'tokek' | 'plane' | 'puffin';

export interface LaunchSticker {
  readonly name: LaunchStickerName;
  /** Design box: top-left corner on the design phone and the art's size. */
  readonly left: number;
  readonly top: number;
  readonly size: number;
  readonly fromRotate: number;
  readonly rotate: number;
  readonly beat: Beat;
}

/** The stickers that pop in as the cover lifts; their images carry a 16 pt shadow margin. */
export const STICKERS: readonly LaunchSticker[] = [
  { name: 'tokek', left: 232, top: 250, size: 116, fromRotate: -20, rotate: -6, beat: 'tokek' },
  { name: 'plane', left: 40, top: 120, size: 58, fromRotate: 0, rotate: 12, beat: 'plane' },
  { name: 'puffin', left: 36, top: 300, size: 76, fromRotate: 0, rotate: -10, beat: 'puffin' },
];
export const STICKER_PAD = 16;

/** The confetti burst's origin, as fractions of the screen. */
export const CONFETTI = { count: 40, originX: 0.55, originY: 0.55 } as const;

export interface ScreenSize {
  readonly width: number;
  readonly height: number;
}

/** A design-phone point as an offset from the screen centre (positions follow the cover). */
export function fromCentre(left: number, top: number): { x: number; y: number } {
  return { x: left - DESIGN_PHONE.width / 2, y: top - DESIGN_PHONE.height / 2 };
}

/** Where a sticker's top-left corner sits on a screen of `screen`'s size. */
export function stickerOrigin(
  sticker: LaunchSticker,
  screen: ScreenSize,
): { x: number; y: number } {
  const offset = fromCentre(sticker.left, sticker.top);
  return { x: screen.width / 2 + offset.x, y: screen.height / 2 + offset.y };
}

/**
 * The cover's resting frame once lifted: its centre, its size after the lift's scale, and its
 * rotation. The welcome screen (2.01) draws its cover here so the hand-off shows nothing moving.
 */
export interface LaunchCoverFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly rotate: number;
}

export function launchCoverFinalFrame(screen: ScreenSize): LaunchCoverFrame {
  return {
    centerX: screen.width / 2,
    centerY: screen.height / 2 + COVER_LIFT.translateY,
    width: COVER.width * COVER_LIFT.scale,
    height: COVER.height * COVER_LIFT.scale,
    rotate: COVER_LIFT.rotate,
  };
}

/** The stamp's date line: the issue day, upper-cased in the app's language ("10 OCT 2026"). */
export function stampDateLabel(issuedAt: Date, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(issuedAt);
  return parts
    .filter((part) => part.type !== 'literal')
    .map((part) => part.value.replace(/\.$/, ''))
    .join(' ')
    .toLocaleUpperCase(locale);
}
