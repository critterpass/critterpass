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
