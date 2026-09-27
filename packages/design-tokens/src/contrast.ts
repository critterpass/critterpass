/**
 * WCAG relative-luminance / contrast-ratio maths, plus `darkenToContrast`: the deterministic
 * darkening step T1 uses to compute each guide colour's `onPaper` variant (design-system.md §1.2:
 * "on paper use darkened variants, >= 4.5:1") instead of hand-picking a hex per hue.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const HEX_SHORT = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
const HEX_LONG = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?$/;
const RGBA_FN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/;

/** Regex capture groups the pattern guarantees are present once `exec` matches; avoids `!`. */
function requireGroup(match: RegExpExecArray, index: number): string {
  const group = match[index];
  if (group === undefined) {
    throw new Error(
      `design-tokens: expected regex capture group ${index} (unreachable if the pattern matched)`,
    );
  }
  return group;
}

/** Parses a hex (#rgb, #rgba, #rrggbb, #rrggbbaa) or rgb()/rgba() literal to 0-255 channels. */
export function parseColor(value: string): Rgb {
  const short = HEX_SHORT.exec(value);
  if (short) {
    const [r, g, b] = [requireGroup(short, 1), requireGroup(short, 2), requireGroup(short, 3)];
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16) };
  }
  const long = HEX_LONG.exec(value);
  if (long) {
    return {
      r: parseInt(requireGroup(long, 1), 16),
      g: parseInt(requireGroup(long, 2), 16),
      b: parseInt(requireGroup(long, 3), 16),
    };
  }
  const fn = RGBA_FN.exec(value);
  if (fn) {
    return { r: Number(fn[1]), g: Number(fn[2]), b: Number(fn[3]) };
  }
  throw new Error(`design-tokens: cannot parse colour literal "${value}"`);
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white); ignores alpha (contrast pairs assume opaque fills). */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * srgbChannelToLinear(rgb.r) +
    0.7152 * srgbChannelToLinear(rgb.g) +
    0.0722 * srgbChannelToLinear(rgb.b)
  );
}

/** WCAG contrast ratio between two colour literals, in [1, 21]. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseColor(a));
  const lb = relativeLuminance(parseColor(b));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbToHsl(rgb: Rgb): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

function hueToRgbChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hh = h / 360;
  return {
    r: Math.round(hueToRgbChannel(p, q, hh + 1 / 3) * 255),
    g: Math.round(hueToRgbChannel(p, q, hh) * 255),
    b: Math.round(hueToRgbChannel(p, q, hh - 1 / 3) * 255),
  };
}

function toHex(rgb: Rgb): string {
  const channel = (c: number) => c.toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/**
 * Reduces `hex`'s HSL lightness in small steps against `backgroundHex` until the contrast ratio
 * reaches `minRatio` (or lightness bottoms out), returning the first hex literal that passes.
 * Deterministic and pure: same inputs always produce the same darkened hex.
 */
export function darkenToContrast(hex: string, backgroundHex: string, minRatio: number): string {
  const hsl = rgbToHsl(parseColor(hex));
  const STEP = 0.02;
  let candidate = hex;
  let l = hsl.l;
  while (contrastRatio(candidate, backgroundHex) < minRatio && l > 0) {
    l = Math.max(0, l - STEP);
    candidate = toHex(hslToRgb({ h: hsl.h, s: hsl.s, l }));
  }
  if (contrastRatio(candidate, backgroundHex) < minRatio) {
    throw new Error(
      `design-tokens: cannot darken "${hex}" to reach ${minRatio}:1 against "${backgroundHex}"`,
    );
  }
  return candidate;
}

export interface ContrastPair {
  readonly name: string;
  readonly fg: string;
  readonly bg: string;
  readonly minRatio: number;
}
