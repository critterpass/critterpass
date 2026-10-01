/**
 * How the hub's header is composed (3k-1): whether the countdown sits beside the destination or
 * drops under it, and the ink scrim over the header's photo that keeps every word on it readable.
 */
import { resolveTypeVariant, tokens } from '@cp/design-tokens';

import { DARK_HIGHLIGHT_DEPTH, mixColour, scrimFor } from '@/ui/media/duotone';
import { ADVANCE_RATIO, AUTO_FIT_MIN_SCALE } from '@/ui/text/auto-fit';

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
export function countdownBeside(input: {
  readonly title: string;
  /** The phase's label and value ("WHEELS UP IN", "17D 05:26:29"). */
  readonly label: string;
  readonly value: string;
  /** The header's width inside the gutters. */
  readonly width: number;
  readonly fontScale?: number;
}): boolean {
  const scale = { fontScale: input.fontScale ?? 1 };
  const eyebrow = resolveTypeVariant(type.eyebrow, scale);
  const h3 = resolveTypeVariant(type.h3, scale);
  const hero = resolveTypeVariant(HERO, scale);
  const valueSize = (h3.fontSize * COUNTDOWN_SIZE) / (type.h3.fontSizeMax ?? COUNTDOWN_SIZE);
  const side = Math.max(
    textWidth(
      input.label,
      eyebrow.fontSize,
      ADVANCE_RATIO.regular + (type.eyebrow.letterSpacing ?? 0),
    ),
    textWidth(input.value, valueSize, ADVANCE_RATIO.condensed + (type.h3.letterSpacing ?? 0)),
  );
  const room = input.width - TITLE_GAP - side;
  const oneLineSize = room / ([...input.title].length * ADVANCE_RATIO.condensed);
  return oneLineSize >= hero.fontSize * (HERO.dynamicType.minScale ?? AUTO_FIT_MIN_SCALE);
}

export interface HeroScrim {
  /** Ink over the photo behind the dates line and the switch pill. */
  readonly label: number;
  /** Ink behind the top of the destination; from there it deepens to solid at the bottom edge. */
  readonly title: number;
}

/**
 * The least ink over the header's media that keeps the cream labels at 4.5:1 and the destination
 * (display type in the trip's colour) at 3:1, whatever the photo shows. A still's brightest tone
 * is the trip colour a little deepened; a loop keeps its own lightness, so its brightest is white.
 */
export function heroScrim(accent: string, loops: boolean): HeroScrim {
  const ink = tokens.color.ink['850'];
  const cream = tokens.color.paper.base;
  const brightest = loops
    ? tokens.color.paper.bright
    : mixColour(accent, ink, DARK_HIGHLIGHT_DEPTH);
  const label = scrimFor(brightest, ink, [{ colour: cream, ratio: 4.5 }]);
  const title = scrimFor(brightest, ink, [
    { colour: accent, ratio: 3 },
    { colour: cream, ratio: 4.5 },
  ]);
  return { label, title: Math.max(label, title) };
}

/**
 * The scrim's gradient down a header `height` tall: clear at the very top of the screen, at the
 * labels' strength where the top row starts, at the destination's where it starts, solid ink at
 * the bottom edge (so the photo ends without a line).
 */
export function scrimStops(
  scrim: HeroScrim,
  layout: { readonly height: number; readonly labelY: number; readonly titleY: number },
): { readonly alphas: readonly number[]; readonly positions: readonly number[] } {
  const at = (y: number) => Math.min(1, Math.max(0, layout.height > 0 ? y / layout.height : 0));
  const label = at(layout.labelY);
  const title = Math.max(label, at(layout.titleY));
  return { alphas: [0, scrim.label, scrim.title, 1], positions: [0, label, title, 1] };
}
