/** The profile's words (3n-1). Plain functions so the view and its tests read the same strings. */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import type { CrewLine, ProfileStamp } from './profile-model';

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: 'UTC' };
const LONG_MONTH_YEAR: Intl.DateTimeFormatOptions = {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
};

function utcDay(date: string): Date {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

export function inDays(days: number): string {
  if (days <= 0) return t({ id: 'you.profile.stamp.today', message: 'Today' });
  return t({
    id: 'you.profile.stamp.inDays',
    message: plural(days, { one: 'In # day', other: 'In # days' }),
  });
}

/** The small line under a stamp's place: "Jun 2024", "In 17 days", or nothing. */
export function stampBottom(stamp: ProfileStamp, locale: string): string | undefined {
  if (stamp.kind === 'upcoming') {
    return stamp.daysUntil === null
      ? t({ id: 'you.profile.stamp.soon', message: 'Soon' })
      : inDays(stamp.daysUntil);
  }
  if (stamp.kind === 'home' || stamp.date === null) return undefined;
  return format.date(locale, utcDay(stamp.date), MONTH_YEAR);
}

export function stampLabel(stamp: ProfileStamp, locale: string): string {
  const bottom = stampBottom(stamp, locale);
  if (stamp.kind === 'home') {
    return t({ id: 'you.profile.stamp.homeLabel', message: `Home stamp, ${stamp.title}` });
  }
  if (stamp.kind === 'upcoming') {
    return t({
      id: 'you.profile.stamp.upcomingLabel',
      message: `${stamp.title}, not stamped yet. ${bottom ?? ''}`,
    });
  }
  return bottom === undefined ? stamp.title : `${stamp.title}, ${bottom}`;
}

export function crewLineText(line: CrewLine, locale: string): string {
  switch (line.kind) {
    case 'upcoming': {
      const { place, days } = line;
      if (days <= 0) return t({ id: 'you.profile.crew.today', message: `${place} today` });
      return t({
        id: 'you.profile.crew.inDays',
        message: plural(days, { one: `${place} in # day`, other: `${place} in # days` }),
      });
    }
    case 'planning':
      return line.place === null
        ? t({ id: 'you.profile.crew.planning', message: 'Planning a trip' })
        : t({ id: 'you.profile.crew.planningPlace', message: `Planning ${line.place}` });
    case 'past': {
      const when = format.date(locale, utcDay(line.date), LONG_MONTH_YEAR);
      return t({ id: 'you.profile.crew.past', message: `${line.place}, ${when}` });
    }
    case 'none':
      return t({ id: 'you.profile.crew.none', message: 'No trips yet' });
  }
}
