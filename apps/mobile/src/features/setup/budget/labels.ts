/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
/** Budget step words that depend on data: stay types, the stay mix line, dates, lock answers. */
import { t, plural } from '@lingui/core/macro';

import { format } from '@cp/i18n';

function stayType(type: string): string {
  switch (type) {
    case 'ryokan':
      return t({ id: 'setup.budget.stay.ryokan', message: 'ryokan' });
    case 'apartment':
      return t({ id: 'setup.budget.stay.apartment', message: 'apartment' });
    case 'hotel':
      return t({ id: 'setup.budget.stay.hotel', message: 'hotel' });
    case 'hostel':
      return t({ id: 'setup.budget.stay.hostel', message: 'hostel' });
    case 'guesthouse':
      return t({ id: 'setup.budget.stay.guesthouse', message: 'guesthouse' });
    case 'villa':
      return t({ id: 'setup.budget.stay.villa', message: 'villa' });
    default:
      return type.replace(/[_-]+/gu, ' ');
  }
}

/** "2 ryokan nights, 5 apartment nights". */
export function stayMixLine(
  parts: readonly { readonly type: string; readonly nights: number }[],
): string {
  return parts
    .filter((part) => part.nights > 0)
    .map((part) => {
      const kind = stayType(part.type);
      return t({
        id: 'setup.budget.stayNights',
        message: plural(part.nights, { one: `# ${kind} night`, other: `# ${kind} nights` }),
      });
    })
    .join(', ');
}

/** "Apr 2–9" in the reader's language. */
export function datesLabel(
  locale: string,
  start: string | null,
  end: string | null,
): string | null {
  if (start === null || end === null) return null;
  return format.dateInterval(locale, new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
