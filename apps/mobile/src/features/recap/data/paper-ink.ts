/**
 * A stored colour as ink on the recap's paper. Stamps and crew members keep a named accent
 * (`red`, `yellow`, `blue/dashed`), which is a design token and not the platform's colour of that
 * name; an accent is then darkened until it reads on paper, the way a guide's accent is.
 */
import { guideAccentOnPaper } from '@cp/critter-art/guides';
import { tokens } from '@cp/design-tokens';

const HEX = /^#[0-9a-f]{6}$/iu;

const ACCENTS: Readonly<Record<string, string>> = {
  yellow: tokens.color.yellow,
  orange: tokens.color.orange,
  blue: tokens.color.blue,
  pink: tokens.color.pink,
  green: tokens.color.green.base,
  red: tokens.color.red,
  cream: tokens.color.paper.muted,
};

/** The accent a stored colour names, as hex; null for anything that is neither a token nor hex. */
export function accentHex(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined) return null;
  const name = stored.split('/')[0] ?? '';
  if (HEX.test(name)) return name;
  return ACCENTS[name] ?? null;
}

/** The stored colour as readable ink on paper, or the fallback accent as ink. */
export function inkOnPaper(stored: string | null | undefined, fallback: string): string {
  return guideAccentOnPaper(accentHex(stored) ?? accentHex(fallback) ?? tokens.color.paper.ink);
}

export interface StampInk {
  /** The ring, its tint and the large word. */
  readonly ink: string;
  /** The small lines along the ring. */
  readonly lineInk: string;
}

/**
 * A stamp's stored colour as stamp ink on paper. Red is the paper's own stamp ink, rust, with its
 * darkened step for the small lines; any other colour is darkened until it reads.
 */
export function stampInkOnPaper(stored: string | null | undefined, fallback: string): StampInk {
  const accent = accentHex(stored) ?? accentHex(fallback);
  if (accent?.toLowerCase() === tokens.color.red.toLowerCase()) {
    return { ink: tokens.color.rust.base, lineInk: tokens.color.rust.darkened };
  }
  const ink = inkOnPaper(stored, fallback);
  return { ink, lineInk: ink };
}
