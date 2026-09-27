/**
 * Splits `value` into user-perceived characters ("grapheme clusters") so truncation never cuts a
 * multi-codepoint emoji (ZWJ sequences, skin-tone modifiers) or a Vietnamese combining-diacritic
 * sequence in half. Falls back to code-point splitting (still correct for surrogate pairs, just not
 * for combining marks) where `Intl.Segmenter` isn't available.
 */
export function graphemes(value: string): string[] {
  const SegmenterCtor = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (SegmenterCtor) {
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), (s) => s.segment);
  }
  return Array.from(value);
}

/** Appends as many graphemes of `value` as fit alongside `ellipsis` within `maxWidth`, per `measure`. */
export function ellipsize(
  value: string,
  maxWidth: number,
  measure: (s: string) => number,
  ellipsis = '…',
): string {
  if (measure(value) <= maxWidth) return value;
  const units = graphemes(value);
  let result = '';
  for (const unit of units) {
    const candidate = result + unit;
    if (measure(candidate + ellipsis) > maxWidth) break;
    result = candidate;
  }
  return result + ellipsis;
}

function greedyWrap(value: string, measure: (s: string) => number, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || measure(candidate) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export interface WrapOptions {
  readonly maxWidth: number;
  readonly maxLines?: number;
  readonly ellipsis?: string;
}

/**
 * Word-wraps `value` to `options.maxWidth` using `measure` (a backend-provided text-width
 * function) — shared by both render backends so line breaks match exactly regardless of which one
 * draws them, rather than trusting each backend's own paragraph reflow to agree. Ellipsizes the
 * last line (grapheme-safe) when the text overflows `options.maxLines`.
 */
export function wrapLines(
  value: string,
  measure: (s: string) => number,
  options: WrapOptions,
): string[] {
  const { maxWidth, maxLines, ellipsis = '…' } = options;
  const lines = greedyWrap(value, measure, maxWidth);
  if (!maxLines || lines.length <= maxLines) return lines;

  const kept = lines.slice(0, maxLines - 1);
  const remainder = lines.slice(maxLines - 1).join(' ');
  kept.push(ellipsize(remainder, maxWidth, measure, ellipsis));
  return kept;
}
