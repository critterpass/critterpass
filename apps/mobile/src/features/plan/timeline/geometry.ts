/**
 * The timeline's scale (3e-2): 34 pt an hour, so a 15-minute slot is 8.5 pt; hour labels and
 * hairlines every two hours; 07–19 by default, stretched to whole hours around anything earlier or
 * later (a 03:30 pickup the next morning extends the axis past midnight).
 */
export const PT_PER_HOUR = 34;
export const PT_PER_MINUTE = PT_PER_HOUR / 60;
export const SLOT_MINUTES = 15;
export const DEFAULT_START_HOUR = 7;
export const DEFAULT_END_HOUR = 19;
/** Width of the hour-label column. */
export const AXIS_GUTTER = 32;

export interface Axis {
  /** Minutes after the day's midnight at the top of the grid. */
  readonly start: number;
  readonly end: number;
}

export interface Span {
  readonly start: number | null;
  readonly end: number | null;
}

/** The grid's range: 07–19, widened to whole hours (an even count, for the 2 h labels). */
export function axisFor(spans: readonly Span[]): Axis {
  let first = DEFAULT_START_HOUR;
  let last = DEFAULT_END_HOUR;
  for (const span of spans) {
    if (span.start !== null) first = Math.min(first, Math.floor(span.start / 60));
    if (span.end !== null) last = Math.max(last, Math.ceil(span.end / 60));
  }
  if ((last - first) % 2 !== 0) last += 1;
  return { start: first * 60, end: last * 60 };
}

export function yOf(minutes: number, axis: Axis): number {
  return (minutes - axis.start) * PT_PER_MINUTE;
}

export function snapToSlot(minutes: number): number {
  'worklet';
  return Math.round(minutes / 15) * 15;
}

/** Hours that carry a label and a hairline (every 2 h from the top). */
export function labelHours(axis: Axis): number[] {
  const hours: number[] = [];
  for (let minute = axis.start; minute <= axis.end; minute += 120) hours.push(minute / 60);
  return hours;
}
