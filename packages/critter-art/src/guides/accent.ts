/**
 * A guide's accent colour. A guide with a token colour keeps it; any other guide takes the first
 * of its critter's own colours that dark text reads on, else its first colour lightened until dark
 * text does. On paper the accent is darkened the way the token colours are. `guides.colour` keeps
 * a named colour for older readers: the named colour nearest the accent.
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

export function guideAccent(slug: string, colours: readonly string[] | null): string {
  const token = tokenColour(slug);
  if (token !== undefined) return token;
  const own = (colours ?? []).map((colour) => toHex(parseColor(colour)));
  const first = own[0];
  if (first === undefined) return NAMED_COLOURS.cream;
  return own.find(readsUnderDarkText) ?? lightenUntilReadable(first);
}

/** The accent as a text colour on paper. */
export function guideAccentOnPaper(accent: string): string {
  return darkenToContrast(accent, tokens.color.paper.base, GUIDE_ACCENT_MIN_RATIO);
}

export function nearestGuideColour(accent: string): GuideColourName {
  const target = parseColor(accent);
  let best: GuideColourName = 'cream';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, hex] of Object.entries(NAMED_COLOURS) as [GuideColourName, string][]) {
    const c = parseColor(hex);
    const distance = (c.r - target.r) ** 2 + (c.g - target.g) ** 2 + (c.b - target.b) ** 2;
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

export function guideLook(slug: string, colours: readonly string[] | null): GuideLook {
  const accent = guideAccent(slug, colours);
  return { accent, colour: nearestGuideColour(accent) };
}
