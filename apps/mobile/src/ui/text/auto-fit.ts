import { useRef, useState } from 'react';
import type { LayoutChangeEvent, TextLayoutEvent, TextStyle } from 'react-native';

import { hasWordBreak } from '../qa/text-layout-check';

/**
 * Flat glyph advance per em for the first-pass size estimate, for faces without measured advances
 * (`display-advance.ts` measures the display face glyph by glyph). Deliberately generous (wider
 * than the real average) so the estimate errs towards fitting.
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

/**
 * An auto-fit string never splits inside a word: when its longest word is wider than the box at
 * the scale floor, the floor drops to the size that word fits at, down to this fraction of the
 * variant's size ("YOUR NEXT TRIP" beside a card's sticker).
 */
export const WHOLE_WORD_MIN_SCALE = 0.3;

const SIZE_SEARCH_STEP_PT = 0.5;

export interface MeasureInput {
  readonly text: string;
  readonly fontSize: number;
  readonly width: number;
  /** Flat advance per character in em, for a face with no measured advances. */
  readonly advanceRatio: number;
  /** Measured advance of one character in em (`displayAdvance`); wins over the flat ratio. */
  readonly advanceOf?: ((char: string) => number) | undefined;
  /** Letter spacing in em (the token's own unit). */
  readonly letterSpacingEm?: number;
}

type Advances = Pick<MeasureInput, 'advanceRatio' | 'advanceOf' | 'letterSpacingEm'>;

/** Rounding slack when a line is filled exactly. */
const EPSILON_EM = 1e-9;

function charEm(char: string, { advanceRatio, advanceOf, letterSpacingEm = 0 }: Advances): number {
  return (advanceOf?.(char) ?? advanceRatio) + letterSpacingEm;
}

/** The width of `text` on one line, in em of its font size. */
export function textEm(text: string, advances: Advances): number {
  let em = 0;
  for (const char of text) em += charEm(char, advances);
  return em;
}

/** Greedy word-wrap line count for `text` at `fontSize` in a box `width` points wide. */
export function estimateLineCount({ text, fontSize, width, ...advances }: MeasureInput): number {
  if (width <= 0 || fontSize <= 0 || advances.advanceRatio + (advances.letterSpacingEm ?? 0) <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  const line = width / fontSize + EPSILON_EM;
  const space = charEm(' ', advances);
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const needed = (used === 0 ? 0 : used + space) + textEm(word, advances);
      if (needed <= line) {
        used = needed;
        continue;
      }
      if (used > 0) lines += 1;
      // A word longer than a line breaks mid-word across as many lines as it needs.
      used = 0;
      for (const char of word) {
        const em = charEm(char, advances);
        if (used > 0 && used + em > line) {
          lines += 1;
          used = 0;
        }
        used += em;
      }
    }
  }
  return lines;
}

/** Largest size at which the longest word of `text` still fits on one line `width` points wide. */
export function wholeWordSize({
  text,
  width,
  ...advances
}: Omit<MeasureInput, 'fontSize'>): number {
  const longest = Math.max(0, ...text.split(/\s+/).map((word) => textEm(word, advances)));
  return longest > 0 ? width / longest : Number.POSITIVE_INFINITY;
}

function points(...values: readonly unknown[]): number {
  const value = values.find((candidate) => candidate !== undefined);
  return typeof value === 'number' ? value : 0;
}

/** The horizontal padding a text style sets inside its own box, which its layout width includes. */
export function horizontalInset(style: TextStyle | null | undefined): number {
  if (!style) return 0;
  const { padding, paddingHorizontal: across } = style;
  return (
    points(style.paddingStart, style.paddingLeft, across, padding) +
    points(style.paddingEnd, style.paddingRight, across, padding)
  );
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

/**
 * True when a line ends without a space, so the next continues the same run: for a code (an MRZ
 * line, a booking ref) any such break splits it, whatever the characters either side.
 */
export function hasUnspacedBreak(lines: readonly { readonly text: string }[]): boolean {
  return lines.slice(0, -1).some((line) => line.text.length > 0 && !/\s$/u.test(line.text));
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
  readonly keepWordsWhole?: boolean | 'code';
  /** At the floor, keep wrapping past the line limit instead of cutting (enlarged text). */
  readonly neverCut?: boolean;
  /** Horizontal padding inside the text's own box: the layout width includes it, the lines don't. */
  readonly inset?: number;
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

type Lines = readonly { readonly text: string }[];

function fresh(key: string): Correction {
  return { key, steps: 0, wrapped: false, overflowed: false };
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
  neverCut = false,
  inset = 0,
  ...fit
}: UseAutoFitOptions): AutoFitResult {
  const active = enabled || keepWordsWhole !== false;
  const [width, setWidth] = useState<number | null>(null);
  const [correction, setCorrection] = useState<Correction>(fresh(''));
  // The platform lays text out before it reports the box's width; those lines are kept until then.
  const early = useRef<{ readonly fontSize: number; readonly lines: Lines } | null>(null);

  /** The fit for a width and the corrections made at it so far. */
  const sizing = (at: number | null) => {
    const key = `${fit.text}|${at ?? ''}|${fit.maxSize}|${fit.maxLines}`;
    const current = correction.key === key ? correction : fresh(key);
    const maxLines = current.wrapped ? Math.max(fit.maxLines, AUTO_FIT_WRAP_LINES) : fit.maxLines;
    const box = at === null ? null : Math.max(0, at - inset);
    // A word wider than the box at the scale floor lowers the floor until it fits whole.
    const floor =
      enabled && box !== null
        ? Math.min(
            fit.minSize,
            Math.max(fit.maxSize * WHOLE_WORD_MIN_SCALE, wholeWordSize({ ...fit, width: box })),
          )
        : fit.minSize;
    const estimated =
      enabled && box !== null ? fitFontSize({ ...fit, minSize: floor, width: box }) : fit.maxSize;
    const fontSize = Math.max(floor, estimated * OVERFLOW_SHRINK_STEP ** current.steps);
    return { current, maxLines, floor, fontSize };
  };

  /** The next correction the platform's lines call for at `fit`, or null when they are settled. */
  const decide = (lines: Lines, at: ReturnType<typeof sizing>): Correction | null => {
    const { current, maxLines, floor, fontSize } = at;
    const overflowing = enabled && isOverflowing(lines, fit.text, maxLines);
    const split =
      keepWordsWhole === 'code' ? hasUnspacedBreak(lines) : keepWordsWhole && hasWordBreak(lines);
    if (!overflowing && !split) return null;
    if (fontSize > floor) return { ...current, steps: current.steps + 1 };
    if (overflowing && wrapAtFloor && !current.wrapped && maxLines < AUTO_FIT_WRAP_LINES) {
      return { ...current, wrapped: true };
    }
    return { ...current, overflowed: true };
  };

  const now = sizing(width);
  const { maxLines, fontSize } = now;
  const { overflowed } = now.current;

  const onLayout = (event: LayoutChangeEvent) => {
    if (!enabled) return;
    const next = event.nativeEvent.layout.width;
    if (next === width) return;
    setWidth(next);
    // Laid out before the width was known at the size the width now gives: no new layout will
    // come, so those lines are the ones to correct.
    const lines = early.current;
    early.current = null;
    const at = sizing(next);
    if (lines !== null && lines.fontSize === at.fontSize) {
      const corrected = decide(lines.lines, at);
      if (corrected !== null) setCorrection(corrected);
    }
  };

  const onTextLayout = (event: TextLayoutEvent) => {
    if (!active || overflowed) return false;
    const { lines } = event.nativeEvent;
    if (enabled && width === null) {
      early.current = { fontSize, lines };
      return true;
    }
    const corrected = decide(lines, now);
    if (corrected !== null) setCorrection(corrected);
    return corrected !== null;
  };

  return {
    fontSize,
    numberOfLines: finite(
      !enabled || !wrapAtFloor || (overflowed && !neverCut) ? maxLines : Number.POSITIVE_INFINITY,
    ),
    // A word still split at the floor is reported as broken, not as cut.
    overflowed: enabled && overflowed && !(neverCut && wrapAtFloor),
    onLayout,
    onTextLayout,
  };
}
