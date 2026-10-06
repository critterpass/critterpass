import { wrapLines } from '../../../packages/critter-art/src/share/text';

export interface FitOptions {
  readonly maxWidth: number;
  readonly maxLines: number;
  /** Font sizes to try, largest first. */
  readonly sizes: readonly number[];
}

export interface FittedText {
  readonly fontSize: number;
  readonly lines: readonly string[];
}

/** The width of `text` set at `fontSize`. */
export type MeasureAt = (text: string, fontSize: number) => number;

/**
 * The largest of `sizes` at which the text wraps into `maxLines` with every line inside
 * `maxWidth`. Throws when none does: a caption is never cut off or squeezed below the smallest
 * size, so the copy has to be shortened instead.
 */
export function fitText(value: string, measureAt: MeasureAt, options: FitOptions): FittedText {
  for (const fontSize of options.sizes) {
    const measure = (text: string): number => measureAt(text, fontSize);
    const lines = wrapLines(value, measure, { maxWidth: options.maxWidth });
    const fits =
      lines.length <= options.maxLines && lines.every((line) => measure(line) <= options.maxWidth);
    if (fits) return { fontSize, lines };
  }
  throw new Error(
    `"${value}" does not fit ${String(options.maxLines)} lines of ${String(Math.round(options.maxWidth))} px at ${String(options.sizes.at(-1))} px: shorten it`,
  );
}
