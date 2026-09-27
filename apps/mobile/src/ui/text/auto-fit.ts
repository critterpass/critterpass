import { useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent } from 'react-native';

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
}

export interface AutoFitResult {
  readonly fontSize: number;
  readonly onLayout: (event: LayoutChangeEvent) => void;
  readonly onTextLayout: (event: TextLayoutEvent) => void;
}

interface Correction {
  readonly key: string;
  readonly steps: number;
}

/**
 * Two-pass auto-fit: estimate from the laid-out width, then shrink in small steps while the
 * platform still reports overflow. Corrections reset whenever the text, width or size range changes.
 */
export function useAutoFit({ enabled, ...fit }: UseAutoFitOptions): AutoFitResult {
  const [width, setWidth] = useState<number | null>(null);
  const [correction, setCorrection] = useState<Correction>({ key: '', steps: 0 });
  const key = `${fit.text}|${width ?? ''}|${fit.maxSize}|${fit.maxLines}`;
  const steps = correction.key === key ? correction.steps : 0;

  const estimated = enabled && width !== null ? fitFontSize({ ...fit, width }) : fit.maxSize;
  const fontSize = Math.max(fit.minSize, estimated * OVERFLOW_SHRINK_STEP ** steps);

  const onLayout = (event: LayoutChangeEvent) => {
    if (!enabled) return;
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  const onTextLayout = (event: TextLayoutEvent) => {
    if (!enabled || fontSize <= fit.minSize) return;
    if (isOverflowing(event.nativeEvent.lines, fit.text, fit.maxLines)) {
      setCorrection({ key, steps: steps + 1 });
    }
  };

  return { fontSize, onLayout, onTextLayout };
}
