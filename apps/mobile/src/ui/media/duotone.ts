/**
 * The duotone a photo takes under a colour hero: its luminance mapped from a shadow tone to a
 * highlight tone, both drawn from the hero's accent, at full strength over the flood. The tones
 * are chosen so the hero's own text keeps its contrast wherever the photo is
 * darkest or lightest (checked in the tests against the worst case of each).
 */
import { contrastRatio, parseColor, tokens } from '@cp/design-tokens';

export type MediaSurface =
  /** Ink text on an accent flood (day-of, destination, option cards). */
  | 'accent'
  /** Accent or cream text on the dark scaffold (the trip hub header). */
  | 'dark';

export interface DuotoneTreatment {
  readonly shadow: string;
  readonly highlight: string;
  /** Opacity of the photo layer over the flood. */
  readonly opacity: number;
  /** The flood under the photo. */
  readonly base: string;
  /**
   * On the dark header: the ink over the photo behind the text, so the photo can stay bright
   * elsewhere. `title` sits behind the wordmark and countdown row, `eyebrow` behind the dates line.
   */
  readonly scrim: { readonly title: number; readonly eyebrow: number } | null;
}

/** How deep towards ink the dark header's brightest photo tone goes (0 = the accent itself). */
export const DARK_HIGHLIGHT_DEPTH = 0.2;

/** The least ink over `tone` that keeps every `text` colour at `ratio` against it. */
export function scrimFor(
  tone: string,
  ink: string,
  text: readonly { readonly colour: string; readonly ratio: number }[],
): number {
  for (let step = 0; step <= 20; step += 1) {
    const alpha = step / 20;
    const under = mixColour(tone, ink, alpha);
    if (text.every(({ colour, ratio }) => contrastRatio(colour, under) >= ratio)) return alpha;
  }
  return 1;
}

const WHITE = tokens.color.paper.bright;

function hex(r: number, g: number, b: number): string {
  const channel = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** `a` moved towards `b` by `t` (0–1), in sRGB. */
export function mixColour(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return hex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}

export function treatmentFor(surface: MediaSurface, accent: string, ink: string): DuotoneTreatment {
  if (surface === 'accent') {
    // The photo at full strength; its tones keep the hero's text readable.
    const opacity = 1;
    // As deep a shadow as the accent allows while ink text on it keeps 4.5:1.
    let depth = 0.35;
    while (
      depth > 0.05 &&
      contrastRatio(ink, composite(mixColour(accent, ink, depth), accent, opacity)) < 4.5
    ) {
      depth -= 0.05;
    }
    return {
      shadow: mixColour(accent, ink, depth),
      highlight: mixColour(accent, WHITE, 0.45),
      opacity,
      base: accent,
      scrim: null,
    };
  }
  // A bright photo; the text keeps its contrast through a scrim behind it, not a darker photo.
  const cream = tokens.color.paper.base;
  const highlight = mixColour(accent, ink, DARK_HIGHLIGHT_DEPTH);
  return {
    shadow: ink,
    highlight,
    opacity: 1,
    base: ink,
    scrim: {
      // The wordmark is display type in the accent (3:1); the countdown is cream (4.5:1).
      title: scrimFor(highlight, ink, [
        { colour: accent, ratio: 3 },
        { colour: cream, ratio: 4.5 },
      ]),
      eyebrow: scrimFor(highlight, ink, [{ colour: cream, ratio: 4.5 }]),
    },
  };
}

/** The colour a pixel of the photo lands on screen: `tone` over `base` at `opacity`. */
export function composite(tone: string, base: string, opacity: number): string {
  return mixColour(base, tone, opacity);
}

/**
 * Skia 4×5 colour matrix (row-major, offsets in 0–1): Rec. 709 luminance of the photo, mapped
 * linearly from `shadow` (black) to `highlight` (white).
 */
export function duotoneMatrix(shadow: string, highlight: string): number[] {
  const s = parseColor(shadow);
  const h = parseColor(highlight);
  const row = (from: number, to: number) => {
    const span = (to - from) / 255;
    return [span * 0.2126, span * 0.7152, span * 0.0722, 0, from / 255];
  };
  return [...row(s.r, h.r), ...row(s.g, h.g), ...row(s.b, h.b), 0, 0, 0, 1, 0];
}
