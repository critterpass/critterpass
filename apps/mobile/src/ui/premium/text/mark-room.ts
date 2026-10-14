/**
 * Room above the first line for marks stacked over a letter (Vietnamese "Hà Nội", "Đà Nẵng",
 * "Ỗ"). iOS draws a text inside its own box and cuts what reaches past the top. With a line height
 * set below the font's own line box it keeps the descent and trims the ascent, so the top of the
 * line box sits on the cap height: a circumflex over "ô" lost its top on the 66 pt hero. Without a
 * line height the font's ascent holds one mark over a capital, but not two.
 *
 * The heights are SF Pro's, in em above the baseline, rounded up for the heavy weights.
 */

/** The font's descent below the baseline, which iOS keeps in a shortened line box. */
const DESCENT_EM = 0.24;
/** The ascent of the font's own line box (no line height set). */
const NATURAL_ASCENT_EM = 0.95;

/** Where the tallest glyph of each kind of letter reaches. */
const REACH_EM = {
  /** Latin ascenders and capitals (b, d, l, H). */
  plain: 0.76,
  /** One mark over a lowercase letter (à, ô, ẽ). */
  lowerOne: 0.8,
  /** One mark over a lowercase ascender (ĺ, ḱ): as tall as a capital's. */
  lowerTallOne: 0.96,
  /** Two marks over a lowercase letter (ẫ, ỗ, ẵ). */
  lowerTwo: 0.94,
  /** One mark over a capital (À, Ô, Ă). */
  upperOne: 0.94,
  /** Two marks over a capital (Ẫ, Ỗ, Ẵ). */
  upperTwo: 1.12,
} as const;

/** Combining marks drawn above the letter (grave to the comma above, U+0300–U+0314). */
function isMarkAbove(code: number): boolean {
  return code >= 0x300 && code <= 0x314;
}

function isMark(code: number): boolean {
  return code >= 0x300 && code <= 0x36f;
}

const TALL_LOWER = new Set(['b', 'd', 'f', 'h', 'k', 'l', 't']);

/** How far above the baseline the text's tallest glyph reaches, in em. */
export function markReachEm(text: string): number {
  let reach: number = REACH_EM.plain;
  let base = '';
  let above = 0;
  const settle = () => {
    if (above === 0 || base === '') return;
    const upper = base !== base.toLowerCase();
    const kind = upper
      ? above > 1
        ? 'upperTwo'
        : 'upperOne'
      : above > 1
        ? 'lowerTwo'
        : TALL_LOWER.has(base)
          ? 'lowerTallOne'
          : 'lowerOne';
    reach = Math.max(reach, REACH_EM[kind]);
  };
  for (const char of text.normalize('NFD')) {
    const code = char.codePointAt(0) ?? 0;
    if (isMark(code)) {
      if (isMarkAbove(code)) above += 1;
      continue;
    }
    settle();
    base = char;
    above = 0;
  }
  settle();
  return reach;
}

/**
 * The points to add above a text's first line so its tallest glyph is drawn whole, at the text's
 * unscaled size; 0 when the line box already holds it.
 */
export function markRoom(text: string, size: number, lineHeight: number | undefined): number {
  const room = lineHeight === undefined ? size * NATURAL_ASCENT_EM : lineHeight - size * DESCENT_EM;
  const missing = size * markReachEm(text) - room;
  return missing > 0.5 ? Math.ceil(missing) : 0;
}

/**
 * True when a laid-out first line has less room above its baseline than its glyphs reach: the
 * marks are cut. `lineHeight` and `descender` are the line's own metrics; `extra` is room the text
 * keeps above the line (its top padding).
 */
export function marksClipped(
  text: string,
  line: { readonly height: number; readonly descender: number; readonly ascender: number },
  extra: number,
): boolean {
  if (line.ascender <= 0) return false;
  // The size the line was set at (after Dynamic Type and any fit), read back from its ascent.
  const size = line.ascender / NATURAL_ASCENT_EM;
  const room = line.height - Math.abs(line.descender) + extra;
  return size * markReachEm(text) - room > 1;
}
