/**
 * The plan as plain text for the system share sheet (a message to the crew's group chat): the
 * trip's place and dates, then each day by its date with its stops and their times, in the
 * reader's language. A stop this person skips for herself is still the crew's, so it stays in.
 */
import { t } from '@lingui/core/macro';

import { clock } from '../day/format';
import { dateLine, tripDates } from './format';
import type { TripDay } from './trip-days';

export function planShareText(input: {
  readonly locale: string;
  readonly destination: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly days: readonly TripDay[];
}): string {
  const { locale } = input;
  const dates = tripDates(locale, input.startDate, input.endDate);
  const head = [input.destination ?? '', dates].filter((part) => part !== '').join(' · ');
  const blocks = input.days.map((day) => {
    const n = day.dayNo;
    const name =
      day.date === null
        ? t({ id: 'plan.tripMap.dayTitle', message: `Day ${n}` })
        : dateLine(locale, day.date);
    const title = day.theme === null ? name : `${name} · ${day.theme}`;
    const stops =
      day.stops.length === 0
        ? [t({ id: 'plan.tripMap.nothingYet', message: 'Nothing planned yet' })]
        : day.stops.map((stop) =>
            stop.start === null ? stop.title : `${clock(locale, stop.start)}  ${stop.title}`,
          );
    return [title, ...stops].join('\n');
  });
  return [head, ...blocks].filter((part) => part !== '').join('\n\n');
}
