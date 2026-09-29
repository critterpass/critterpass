import { useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';

import { hasWordBreak } from '../qa/text-layout-check';

/**
 * Average glyph advance per em, used for the first-pass size estimate before the platform reports
 * real line breaks. Archivo's condensed display cuts run narrower than Geist's body text; both are
 * deliberately generous (wider than the real average) so the estimate errs towards fitting.
 */
export const ADVANCE_RATIO = { condensed: 0.56, regular: 0.6 } as const;

/** Each overflow correction after layout shrinks by this factor until the variant's minimum. */
export const OVERFLOW_SHRINK_STEP = 0.92;

/** docs/design-system.md §5: auto-fit never shrinks below .7 of the variant's scaled size. */
export const AUTO_FIT_MIN_SCALE = 0.7;

/**
 * docs/design-system.md §5: auto-fit text that still overflows at its floor wraps (up to three
 * lines) instead of being cut with an ellipsis.
 */
export const AUTO_FIT_WRAP_LINES = 3;

const SIZE_SEARCH_STEP_PT = 0.5;

export interface MeasureInput {
  readonly text: string;
  readonly fontSize: number;
  readonly width: number;
  readonly advanceRatio: number;
  /** Letter spacing in em (the token's own unit). */
  readonly letterSpacingEm?: number;
}

/** Greedy word-wrap line count for `text` at `fontSize` in a box `width` points wide. */
export function estimateLineCount({
  text,
  fontSize,
  width,
  advanceRatio,
  letterSpacingEm = 0,
}: MeasureInput): number {
  const charWidth = fontSize * (advanceRatio + letterSpacingEm);
  if (width <= 0 || charWidth <= 0) return Number.POSITIVE_INFINITY;
  const charsPerLine = Math.max(1, Math.floor(width / charWidth));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const length = [...word].length;
      const needed = used === 0 ? length : used + 1 + length;
      if (needed <= charsPerLine) {
        used = needed;
        continue;
      }
      if (used > 0) lines += 1;
      // A word longer than a line breaks mid-word across as many lines as it needs.
      lines += Math.ceil(length / charsPerLine) - 1;
      used = length % charsPerLine || charsPerLine;
    }
  }
  return lines;
}

export interface FitInput extends Omit<MeasureInput, 'fontSize'> {
  readonly maxSize: number;
  readonly minSize: number;
  readonly maxLines: number;
}

/** Largest size in `[minSize, maxSize]` whose estimated wrap stays within `maxLines`. */
export function fitFontSize({ maxSize, minSize, maxLines, ...measure }: FitInput): number {
  for (let size = maxSize; size >= minSize; size -= SIZE_SEARCH_STEP_PT) {
    if (estimateLineCount({ ...measure, fontSize: size }) <= maxLines) return size;
  }
  return minSize;
}

/** True when the platform's layout broke `fullText` into more lines than allowed or truncated it. */
export function isOverflowing(
  lines: readonly { readonly text: string }[],
  fullText: string,
  maxLines: number,
): boolean {
  if (lines.length > maxLines) return true;
  const rendered = lines.reduce((sum, line) => sum + line.text.trim().length, 0);
  return rendered < fullText.replace(/\s+/g, '').length;
}

export interface UseAutoFitOptions extends Omit<FitInput, 'width'> {
  readonly enabled: boolean;
  /**
   * The line limit is the variant's own, not the caller's: it is measured unlimited and wraps onto
   * more lines once the floor is reached. A caller's `numberOfLines` is always rendered as given.
   */
  readonly wrapAtFloor?: boolean;
  /**
   * Shrinks, down to `minSize`, while the platform splits a word across lines ("KILOMET" /
   * "RES"): a label word wider than its box. Works without `enabled`, and then leaves the line
   * limit and the first-pass estimate alone.
   */
  readonly keepWordsWhole?: boolean;
}

export interface AutoFitResult {
  readonly fontSize: number;
  /**
   * The `numberOfLines` to render with. While fitting there is none: iOS reports a line it
   * truncated with its full text, so only an unlimited layout shows the real line count. The limit
   * comes back only when the text still overflows at its floor.
   */
  readonly numberOfLines: number | undefined;
  /** The text overflowed at its floor and is shown cut at `numberOfLines`. */
  readonly overflowed: boolean;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  /** Returns true while it is still correcting, i.e. this layout is not the settled one. */
  readonly onTextLayout: (event: TextLayoutEvent) => boolean;
}

interface Correction {
  readonly key: string;
  readonly steps: number;
  readonly wrapped: boolean;
  readonly overflowed: boolean;
}

function finite(lines: number): number | undefined {
  return Number.isFinite(lines) ? lines : undefined;
}

/**
 * Two-pass auto-fit: estimate from the laid-out width, then shrink in small steps while the
 * platform still lays the text out on more lines than allowed; at the floor a single-line style
 * wraps (up to three lines), and only then is the text cut. Corrections reset whenever the text,
 * width or size range changes.
 */
export function useAutoFit({
  enabled,
  wrapAtFloor = false,
  keepWordsWhole = false,
  ...fit
}: UseAutoFitOptions): AutoFitResult {
  const active = enabled || keepWordsWhole;
  const [width, setWidth] = useState<number | null>(null);
  const fresh = (key: string): Correction => ({ key, steps: 0, wrapped: false, overflowed: false });
  const [correction, setCorrection] = useState<Correction>(fresh(''));
  const key = `${fit.text}|${width ?? ''}|${fit.maxSize}|${fit.maxLines}`;
  const current = correction.key === key ? correction : fresh(key);
  const { steps, wrapped, overflowed } = current;
  const maxLines = wrapped ? Math.max(fit.maxLines, AUTO_FIT_WRAP_LINES) : fit.maxLines;

  const estimated = enabled && width !== null ? fitFontSize({ ...fit, width }) : fit.maxSize;
  const fontSize = Math.max(fit.minSize, estimated * OVERFLOW_SHRINK_STEP ** steps);

  const onLayout = (event: LayoutChangeEvent) => {
    if (!enabled) return;
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const onTextLayout = (event: TextLayoutEvent) => {
    if (!active || overflowed) return false;
    // The first layout runs before the width is known: the fit hasn't started yet. Keeping words
    // whole needs no width, only the platform's line breaks.
    if (enabled && width === null) return true;
    const { lines } = event.nativeEvent;
    const overflowing = enabled && isOverflowing(lines, fit.text, maxLines);
    if (!overflowing && !(keepWordsWhole && hasWordBreak(lines))) return false;
    if (fontSize > fit.minSize) {
      setCorrection({ ...current, steps: steps + 1 });
    } else if (overflowing && wrapAtFloor && !wrapped && maxLines < AUTO_FIT_WRAP_LINES) {
      setCorrection({ ...current, wrapped: true });
    } else {
      setCorrection({ ...current, overflowed: true });
    }
    return true;
  };

  return {
    fontSize,
    numberOfLines: finite(
      !enabled || !wrapAtFloor || overflowed ? maxLines : Number.POSITIVE_INFINITY,
    ),
    // A word still split at the floor is reported as broken, not as cut.
    overflowed: enabled && overflowed,
    onLayout,
    onTextLayout,
  };
}
