import { useState } from 'react';

/**
 * How far Archivo's marks reach past its capitals, in em from the baseline, over every bundled
 * width and weight (the line-box test re-measures the font files). Marks above stack: a circumflex
 * or breve carrying a second mark (Ẵ, Ể, Ỗ) is the tallest glyph of the face; marks below (Ạ, Ç)
 * hang under the baseline.
 */
export const DISPLAY_INK = {
  /** The round capitals' top (flat ones stop at 0.687). */
  cap: 0.7,
  /** One mark above a capital (À, Ã, Ư, and the taller hook of Ả). */
  capMark: 0.897,
  /** The ring of Å. */
  capRing: 0.944,
  /** Two marks stacked above a capital (Ẵ, Ể, Ỗ). */
  capStacked: 1.059,
  /** Two marks stacked above a small letter (ẵ, ể, ỗ); one mark stays under its ascenders. */
  smallStacked: 0.922,
  /** The dot below (Ạ, Ệ, Ự). */
  dotBelow: 0.196,
  /** A cedilla, ogonek or comma below (Ç, Ş, Ą). */
  hookBelow: 0.211,
} as const;

/** The display styles' Latin leading: what a line of capitals under another is designed with. */
const LATIN_DISPLAY_LEADING = 0.86;

/**
 * The clear space the display leading leaves between a line's baseline and the capitals of the
 * line under it. A mark keeps the same space from what is above it.
 */
export const DISPLAY_LINE_GAP = LATIN_DISPLAY_LEADING - DISPLAY_INK.cap;

const STACKING_MARK = /[̀-̄̆-̌]/u;
const HORN = '̛';
const RING = '̊';
const DOT_BELOW = '̣';
const HOOK_BELOW = /[̦-̨]/u;

export interface InkExtent {
  /** Highest ink above the baseline, in em: the capitals' top for a line without marks. */
  readonly top: number;
  /** Depth of marks below the baseline, in em; letters' own descenders are the design's. */
  readonly bottom: number;
}

function letterExtent(letter: string): InkExtent {
  const [base = '', ...marks] = letter.normalize('NFD');
  let above = 0;
  let ring = false;
  let horn = false;
  let bottom = 0;
  for (const mark of marks) {
    if (mark === HORN) horn = true;
    else if (STACKING_MARK.test(mark)) {
      above += 1;
      ring ||= mark === RING;
    } else if (mark === DOT_BELOW) bottom = Math.max(bottom, DISPLAY_INK.dotBelow);
    else if (HOOK_BELOW.test(mark)) bottom = Math.max(bottom, DISPLAY_INK.hookBelow);
  }
  const capital = base !== base.toLowerCase();
  let top: number = DISPLAY_INK.cap;
  if (above >= 2) top = capital ? DISPLAY_INK.capStacked : DISPLAY_INK.smallStacked;
  else if (capital && ring) top = DISPLAY_INK.capRing;
  else if (capital && (above === 1 || horn)) top = DISPLAY_INK.capMark;
  return { top, bottom };
}

/** The ink of one line of display text: its tallest mark above and its deepest mark below. */
export function inkExtent(line: string): InkExtent {
  let top: number = DISPLAY_INK.cap;
  let bottom = 0;
  // Precomposed letters (the form catalogs and place names use) are measured one by one.
  for (const letter of line.normalize('NFC')) {
    const extent = letterExtent(letter);
    top = Math.max(top, extent.top);
    bottom = Math.max(bottom, extent.bottom);
  }
  return { top, bottom };
}

/**
 * The line height (in em) wrapped display text needs: for every line under another, its tallest
 * mark, the marks hanging under the line above and the designed gap between them. Lines of plain
 * capitals need exactly the Latin display leading, so text without marks keeps `base`, as does a
 * single line (its marks get their room from the glyph room above the text box).
 */
export function wrappedLeading(lines: readonly string[], base: number): number {
  let leading = base;
  for (let index = 1; index < lines.length; index += 1) {
    const above = inkExtent(lines[index - 1] ?? '');
    const below = inkExtent(lines[index] ?? '');
    leading = Math.max(leading, below.top + above.bottom + DISPLAY_LINE_GAP);
  }
  return Math.round(leading * 1000) / 1000;
}

export interface WrappedLeading {
  /** The line height multiplier to render with. */
  readonly multiplier: number;
  /** Reads the platform's lines; true when they call for a new line height (one more layout). */
  readonly onLines: (lines: readonly { readonly text: string }[]) => boolean;
}

/**
 * Opens the line height of wrapped display text once the platform reports where it broke. A line
 * height never moves a line break, so one correction settles it; a later change of text, size or
 * width reports new lines and is corrected again.
 */
export function useWrappedLeading(enabled: boolean, base: number): WrappedLeading {
  const [leading, setLeading] = useState(base);
  const multiplier = enabled ? Math.max(base, leading) : base;
  return {
    multiplier,
    onLines: (lines) => {
      if (!enabled) return false;
      const next = wrappedLeading(
        lines.map((line) => line.text),
        base,
      );
      if (next === multiplier) return false;
      setLeading(next);
      return true;
    },
  };
}
