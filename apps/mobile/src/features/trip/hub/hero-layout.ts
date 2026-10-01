/**
 * How the hub's header is composed (3k-1): whether the countdown sits beside the destination or
 * drops under it, where the countdown's baseline goes, and where the header's own ink scrim over
 * its photo starts.
 */
import { resolveTypeVariant, tokens } from '@cp/design-tokens';

import { ADVANCE_RATIO, AUTO_FIT_MIN_SCALE } from '@/ui/text/auto-fit';
import { FACE_METRICS } from '@/ui/text/glyph-room';

const { type } = tokens;
const HERO = type.display.hero;

/** The gap between the destination and the countdown beside it. */
export const TITLE_GAP = tokens.space['12'];

function textWidth(text: string, size: number, emPerGlyph: number): number {
  return [...text].length * size * emPerGlyph;
}

/** The size the render sets the countdown at, inside h3's range (20–28). */
export const COUNTDOWN_SIZE = 22;

/**
 * True when the countdown fits beside the destination with the destination on one line and no
 * smaller than the display face's auto-fit floor. A longer name ("ĐÀ NẴNG", "MEXICO CITY") or a
 * narrower screen takes the whole width for the name and sets the countdown under it, instead of
 * shrinking the name further to make room.
 */
export function countdownBeside(input: TitleLine): boolean {
  return titleLineSize(input) >= heroFloor(input.fontScale);
}

export interface TitleLine {
  readonly title: string;
  /** The phase's label and value ("WHEELS UP IN", "17D 05:26:29"). */
  readonly label: string;
  readonly value: string;
  /** The header's width inside the gutters. */
  readonly width: number;
  readonly fontScale?: number;
}

function heroFloor(fontScale = 1): number {
  const hero = resolveTypeVariant(HERO, { fontScale });
  return hero.fontSize * (HERO.dynamicType.minScale ?? AUTO_FIT_MIN_SCALE);
}

/** The countdown's size at this text scale. */
export function countdownSize(fontScale = 1): number {
  const h3 = resolveTypeVariant(type.h3, { fontScale });
  return (h3.fontSize * COUNTDOWN_SIZE) / (type.h3.fontSizeMax ?? COUNTDOWN_SIZE);
}

/** The size the destination gets on one line beside the countdown, by the auto-fit's estimate. */
export function titleLineSize(input: TitleLine): number {
  const scale = { fontScale: input.fontScale ?? 1 };
  const eyebrow = resolveTypeVariant(type.eyebrow, scale);
  const hero = resolveTypeVariant(HERO, scale);
  const side = Math.max(
    textWidth(
      input.label,
      eyebrow.fontSize,
      ADVANCE_RATIO.regular + (type.eyebrow.letterSpacing ?? 0),
    ),
    textWidth(
      input.value,
      countdownSize(input.fontScale),
      ADVANCE_RATIO.condensed + (type.h3.letterSpacing ?? 0),
    ),
  );
  const room = input.width - TITLE_GAP - side;
  return Math.min(hero.fontSize, room / ([...input.title].length * ADVANCE_RATIO.condensed));
}

/** The eyebrow line's height: how far the phase's label hangs above the countdown's box. */
export function labelHeight(fontScale = 1): number {
  return resolveTypeVariant(type.eyebrow, { fontScale }).lineHeight;
}

/**
 * How far the countdown rises so its baseline meets the destination's when their boxes share a
 * bottom edge. Each line centres its face (Archivo: ascent .878, descent .21 em) on its line
 * height, so a baseline sits `(leading − face) / 2 + descent` em above its box's bottom.
 */
export function baselineLift(input: {
  readonly titleSize: number;
  /** The destination's line height in em (the display face's, or its script's own). */
  readonly titleLeading: number;
  readonly valueSize: number;
}): number {
  const { ascent, descent } = FACE_METRICS['Archivo'] ?? { ascent: 0, descent: 0 };
  const above = (leading: number) => (leading - (ascent + descent)) / 2 + descent;
  return Math.max(
    0,
    above(input.titleLeading) * input.titleSize - above(type.h3.lineHeight) * input.valueSize,
  );
}

/** The photo's own room between the dates line and the destination when the header has media. */
export const MEDIA_WINDOW = tokens.space['32'] * 2;

/**
 * Where the media layer's dark treatment (`@/ui/media/MediaLayer`, surface `dark`) carries the ink
 * its text needs, as fractions of its height: from `label` down, enough for cream labels at
 * 4.5:1; from `title` down, enough for the trip colour at 3:1 too.
 */
export const LAYER_ZONES = { label: 0.06, title: 0.32 } as const;

/** True when the dates line and the destination sit where the media layer keeps their contrast. */
export function textInLayerZones(layout: {
  readonly height: number;
  readonly labelY: number;
  readonly titleY: number;
}): boolean {
  return (
    layout.labelY >= layout.height * LAYER_ZONES.label &&
    layout.titleY >= layout.height * LAYER_ZONES.title
  );
}

/**
 * The header's own scrim over the media, down a header `height` tall: clear from the top of the
 * screen to the middle of the destination, then deepening to solid ink at the bottom edge, so the
 * destination's lower half and the countdown sit on near-solid ink and the photo ends in the page
 * without a line. Above that the photo shows at the strength the media layer gives it.
 */
export function scrimStops(layout: { readonly height: number; readonly titleY: number }): {
  readonly alphas: readonly number[];
  readonly positions: readonly number[];
} {
  const { height, titleY } = layout;
  const from = height > 0 ? Math.min(1, Math.max(0, (titleY + (height - titleY) / 2) / height)) : 0;
  return { alphas: [0, 0, 1], positions: [0, from, 1] };
}
