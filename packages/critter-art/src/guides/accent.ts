/**
 * A guide's accent colour. A guide with a token colour keeps it; any other guide takes the most
 * saturated of its critter's own colours that dark text reads on, so a pale critter is known by
 * its mane or beak and takes its fill only when it has nothing stronger. When only pale colours
 * read, its darker colours count too, lightened until dark text reads on them. On
 * paper the accent is darkened the way the token colours are. `guides.colour` keeps a named colour
 * for older readers: the named colour nearest the accent by hue, cream for one with no hue to
 * speak of.
 */
import { contrastRatio, darkenToContrast, parseColor, tokens } from '@cp/design-tokens';

/** The ratio guide colours hold under dark text and, darkened, on paper. */
export const GUIDE_ACCENT_MIN_RATIO = 4.5;

const NAMED_COLOURS = {
  yellow: tokens.color.yellow,
  orange: tokens.color.orange,
  blue: tokens.color.blue,
  pink: tokens.color.pink,
  green: tokens.color.green.base,
  cream: tokens.color.paper.warm,
  red: tokens.color.red,
} as const;
export type GuideColourName = keyof typeof NAMED_COLOURS;

export interface GuideLook {
  /** `#rrggbb`, lowercase. */
  readonly accent: string;
  readonly colour: GuideColourName;
}

const LIGHTEN_STEP = 0.04;

function toHex(rgb: { r: number; g: number; b: number }): string {
  const channel = (value: number) => Math.round(value).toString(16).padStart(2, '0');
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

const readsUnderDarkText = (hex: string) =>
  contrastRatio(tokens.semantic.text.onAccent, hex) >= GUIDE_ACCENT_MIN_RATIO;

function lightenUntilReadable(hex: string): string {
  const from = parseColor(hex);
  for (let t = LIGHTEN_STEP; t < 1; t += LIGHTEN_STEP) {
    const candidate = toHex({
      r: from.r + (255 - from.r) * t,
      g: from.g + (255 - from.g) * t,
      b: from.b + (255 - from.b) * t,
    });
    if (readsUnderDarkText(candidate)) return candidate;
  }
  return '#ffffff';
}

function tokenColour(slug: string): string | undefined {
  const value: unknown = Object.entries(tokens.guide).find(([key]) => key === slug)?.[1];
  return typeof value === 'string' ? value : undefined;
}

/** How far a colour is from grey, 0 to 255. */
function saturation(hex: string): number {
  const { r, g, b } = parseColor(hex);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Below this a colour reads as off-white or grey: nothing a guide could be known by. */
const PALE_SATURATION = 48;

function mostSaturated(colours: readonly string[]): string | undefined {
  let best = colours[0];
  for (const colour of colours) {
    if (best !== undefined && saturation(colour) > saturation(best)) best = colour;
  }
  return best;
}

export function guideAccent(slug: string, colours: readonly string[] | null): string {
  const token = tokenColour(slug);
  if (token !== undefined) return token;
  const own = (colours ?? []).map((colour) => toHex(parseColor(colour)));
  if (own.length === 0) return NAMED_COLOURS.cream;
  const readable = mostSaturated(own.filter(readsUnderDarkText));
  if (readable !== undefined && saturation(readable) >= PALE_SATURATION) return readable;
  // Only pale colours read as they are: its darker colours, lightened, may say more.
  const lightened = own.filter((colour) => !readsUnderDarkText(colour)).map(lightenUntilReadable);
  return mostSaturated([...(readable === undefined ? [] : [readable]), ...lightened]) ?? '#ffffff';
}

/** The accent as a text colour on paper. */
export function guideAccentOnPaper(accent: string): string {
  return darkenToContrast(accent, tokens.color.paper.base, GUIDE_ACCENT_MIN_RATIO);
}

/** Below this a colour reads as off-white or grey, whatever its hue. */
const HUELESS_CHROMA = 0.04;

/** A colour's chroma and hue angle (degrees) in OKLab, where equal steps look equal. */
function chromaAndHue(hex: string): { chroma: number; hue: number } {
  const { r, g, b } = parseColor(hex);
  const linear = (value: number) => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { chroma: Math.hypot(a, bb), hue: (Math.atan2(bb, a) * 180) / Math.PI };
}

export function nearestGuideColour(accent: string): GuideColourName {
  const named = Object.entries(NAMED_COLOURS).find(([, hex]) => hex === accent)?.[0];
  if (named !== undefined) return named as GuideColourName;
  const target = chromaAndHue(accent);
  if (target.chroma < HUELESS_CHROMA) return 'cream';
  let best: GuideColourName = 'cream';
  let bestTurn = Number.POSITIVE_INFINITY;
  for (const [name, hex] of Object.entries(NAMED_COLOURS) as [GuideColourName, string][]) {
    if (name === 'cream') continue;
    const apart = Math.abs(chromaAndHue(hex).hue - target.hue) % 360;
    const turn = Math.min(apart, 360 - apart);
    if (turn < bestTurn) {
      best = name;
      bestTurn = turn;
    }
  }
  return best;
}

export function guideLook(slug: string, colours: readonly string[] | null): GuideLook {
  const accent = guideAccent(slug, colours);
  return { accent, colour: nearestGuideColour(accent) };
}
