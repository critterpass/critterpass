import { compactNumber, countdownUnit, number, percent } from './number.js';
import { date, dateInterval, relativeTime, time } from './datetime.js';
import { list } from './list.js';
import { distance } from './distance.js';

export type { TimeFormatOptions } from './datetime.js';
export type { DistanceUnit } from './distance.js';

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
