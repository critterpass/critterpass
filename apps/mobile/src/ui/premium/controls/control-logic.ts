/** Pure layout and value rules behind the segmented control and the stepper. */

export interface SegmentFrame {
  readonly x: number;
  readonly width: number;
}

/**
 * Where each segment (and so the thumb) sits inside a track of `width`, after `pad` on each side.
 * Segments share the inner width by weight (the design gives a longer label 1.4×).
 */
export function segmentFrames(
  width: number,
  pad: number,
  weights: readonly number[],
): readonly SegmentFrame[] {
  const inner = Math.max(0, width - pad * 2);
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return weights.map(() => ({ x: pad, width: 0 }));
  let x = pad;
  return weights.map((w) => {
    const segment = (inner * Math.max(0, w)) / total;
    const frame = { x, width: segment };
    x += segment;
    return frame;
  });
}

/** How far a segmented control's labels may shrink, all together, to stay on one line each. */
export const SEGMENT_FIT_FLOOR = 0.8;

export interface SegmentFit {
  /** Each segment's share of the track. */
  readonly weights: readonly number[];
  /** One type scale for every label (1 = the token's size). */
  readonly scale: number;
}

/**
 * How a full-width segmented control fits its labels on one line each, at one size: first in the
 * shares it was given, shrinking every label alike down to `SEGMENT_FIT_FLOOR`; when that is not
 * enough (a long Vietnamese label beside short ones), the segments take shares by their labels'
 * widths instead, and every label shrinks alike to fit those. `natural` holds each label's
 * one-line width at full size, `pad` the room a segment keeps either side of its label.
 */
export function fitSegments(input: {
  readonly width: number;
  readonly trackPad: number;
  readonly pad: number;
  readonly weights: readonly number[];
  readonly natural: readonly (number | undefined)[];
}): SegmentFit {
  const { width, trackPad, pad, weights, natural } = input;
  const measured = natural.every((n) => n !== undefined && n > 0);
  if (width <= 0 || !measured) return { weights, scale: 1 };
  const labels = natural as readonly number[];
  const frames = segmentFrames(width, trackPad, weights);
  const given = Math.min(
    1,
    ...frames.map((frame, at) => Math.max(0, frame.width - pad * 2) / (labels[at] ?? 1)),
  );
  if (given >= SEGMENT_FIT_FLOOR) return { weights, scale: given };
  const inner = Math.max(0, width - trackPad * 2 - pad * 2 * labels.length);
  const total = labels.reduce((sum, n) => sum + n, 0);
  const scale = Math.max(SEGMENT_FIT_FLOOR, Math.min(1, inner / total));
  return { weights: labels.map((n) => n * scale + pad * 2), scale };
}

export interface StepperBounds {
  readonly min: number;
  readonly max: number;
  /** @default 1 */
  readonly step?: number;
}

/** `value` moved by `direction` steps and kept inside the bounds. */
export function stepValue(value: number, direction: 1 | -1, bounds: StepperBounds): number {
  const step = bounds.step ?? 1;
  const next = value + direction * step;
  return Math.min(bounds.max, Math.max(bounds.min, next));
}

/** Whether − and + can still move the value. */
export function stepperCan(
  value: number,
  bounds: StepperBounds,
): { readonly decrement: boolean; readonly increment: boolean } {
  return { decrement: value > bounds.min, increment: value < bounds.max };
}

/** A progress fraction clamped to 0…1 (a bad total reads as empty, never as overflowing). */
export function progressFraction(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, value / total));
}
