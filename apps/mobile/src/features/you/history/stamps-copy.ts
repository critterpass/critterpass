/** The stamps list's lines (one per stamp, under its place). */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { stampBottom } from '../profile/profile-copy';
import type { ProfileStamp } from './stamp-book';

const LONG_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};

function when(date: string, locale: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  return format.date(locale, new Date(`${date.slice(0, 10)}T00:00:00Z`), LONG_MONTH_YEAR);
}

/** "June 2024", "March 2019 · Self-reported", "Home base", "In 17 days". */
export function stampLine(stamp: ProfileStamp, locale: string): string {
  switch (stamp.kind) {
    case 'home':
      return t({ id: 'you.stamps.home', message: 'Home base' });
    case 'upcoming':
      return stampBottom(stamp, locale) ?? '';
    case 'self':
      return stamp.date === null
        ? t({ id: 'you.stamps.selfReported', message: 'Self-reported' })
        : t({
            id: 'you.stamps.selfReportedWhen',
            message: `${when(stamp.date, locale)} · Self-reported`,
          });
    case 'trip':
      return stamp.date === null ? '' : when(stamp.date, locale);
  }
}
