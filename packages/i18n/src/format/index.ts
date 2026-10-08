import { compactNumber, countdownUnit, number, percent } from './number';
import { date, dateInterval, relativeTime, time } from './datetime';
import { list } from './list';
import { distance } from './distance';

export type { TimeFormatOptions } from './datetime';
export type { DistanceUnit } from './distance';
export { dateTimeFormat, listFormat, numberFormat, relativeTimeFormat } from './formatter-cache';

/** `Intl` wrappers grouped as `format.*` per the package's public API (design-system.md §6). */
export const format = {
  number,
  compactNumber,
  percent,
  countdownUnit,
  date,
  time,
  dateInterval,
  relativeTime,
  list,
  distance,
};
