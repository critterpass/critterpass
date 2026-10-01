/**
 * The duotone a photo takes under a colour hero: its luminance mapped from a shadow tone to a
 * highlight tone, both drawn from the hero's accent, laid over the accent flood at a set opacity.
 * Tones and opacity are chosen so the hero's own text keeps its contrast wherever the photo is
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
    const opacity = 0.5;
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
    };
  }
  const opacity = 0.7;
  const cream = tokens.color.paper.base;
  // As bright a highlight as the accent wordmark (3:1) and cream text (4.5:1) allow over it.
  let depth = 0.3;
  const readable = (highlight: string) => {
    const under = composite(highlight, ink, opacity);
    return contrastRatio(accent, under) >= 3 && contrastRatio(cream, under) >= 4.5;
  };
  while (depth < 0.9 && !readable(mixColour(accent, ink, depth))) depth += 0.05;
  return { shadow: ink, highlight: mixColour(accent, ink, depth), opacity, base: ink };
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
