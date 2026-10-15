/**
 * The next-up card's countdown chip: `17D 05:26:47` ticking every second in tabular numerals,
 * `05:26:47` inside the last day, then TODAY and DAY n in the destination's zone. The target is the
 * viewer's stored countdown instant (their first outbound flight, else the first day's midnight at
 * the destination), so it ticks the same offline and in any zone. Screen readers hear the time left
 * in words ("17 days, 5 hours to Bali"), refreshed by the minute rather than every tick.
 */

import { format } from '@cp/i18n';

type Spoken = readonly [number, 'day' | 'hour' | 'minute'];

/** "17 days, 5 hours" (or "5 hours, 26 minutes" inside the last day), in the reader's language. */
export function spokenLeft(
  locale: string,
  display: { readonly days: number; readonly hours: number; readonly minutes: number },
): string {
  const parts: Spoken[] =
    display.days > 0
      ? [
          [display.days, 'day'],
          [display.hours, 'hour'],
        ]
      : [
          [display.hours, 'hour'],
          [display.minutes, 'minute'],
        ];
  const kept = parts.filter(([value]) => value > 0);
  return format.list(
    locale,
    (kept.length > 0 ? kept : parts.slice(-1)).map(([value, unit]) =>
      format.number(locale, value, { style: 'unit', unit, unitDisplay: 'long' }),
    ),
    { type: 'unit', style: 'long' },
  );
}
