/**
 * Lines the premium crew pages share: why a start did not go through, how an earned cover is
 * earned, the invite message, the code's expiry and a member's first name.
 */
import { plural, t } from '@lingui/core/macro';

import type { CrewCover } from '@cp/domain';

import { memberFirstName } from '@/ui/people/member-name';

import type { StartStep } from '../start-crew/use-start-crew';

export function startNote(step: StartStep, refusal: string | null, slow: boolean): string | null {
  if (step.kind === 'failed') {
    return refusal === 'crew_limit'
      ? t({
          id: 'crew.start.crewLimit',
          message: 'You’re in ten crews already. Leave one to start another.',
        })
      : t({
          id: 'crew.start.didNotGoThrough',
          message: 'That didn’t go through. Check your signal and try again.',
        });
  }
  if (step.kind === 'not_ready') {
    return t({
      id: 'crew.start.notReady',
      message: 'Still getting your pass ready. Try again in a moment.',
    });
  }
  if (slow) {
    return t({
      id: 'crew.start.slow',
      message: 'Still working on it. The connection is slow; this can take a little while.',
    });
  }
  return null;
}

export function coverLockedNote(cover: CrewCover): string {
  return cover === 'collector'
    ? t({
        id: 'crew.premium.cover.lockedCollector',
        message: 'Five friends who join and plan a trip unlock the Collector cover.',
      })
    : t({
        id: 'crew.premium.cover.lockedNavy',
        message: 'Three friends who join and plan a trip unlock the Navy cover.',
      });
}

export function inviteMessage(crew: string, url: string, code: string): string {
  return t({
    id: 'crew.premium.inviteMessage',
    message: `Join ${crew} on CritterPass: ${url} (code ${code})`,
  });
}

/** "Works until 24 Oct" from the code's own expiry; null when the server set none. */
export function codeValidLine(expiresAt: string | null, locale: string): string | null {
  if (expiresAt === null) return null;
  const at = new Date(expiresAt);
  if (Number.isNaN(at.getTime())) return null;
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(at);
  return t({ id: 'crew.premium.code.until', message: `Works until ${date}` });
}

const DAY_MS = 86_400_000;

/** Midnight of a `YYYY-MM-DD` date on this phone, or null when it doesn't read as a date. */
function localDay(date: string): Date | null {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time, never copy.
  const at = new Date(`${date}T00:00:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Whole days from today's midnight to the code's expiry ("7 days left"); null without an expiry. */
export function codeDaysLeft(expiresAt: string | null, now: Date): string | null {
  if (expiresAt === null) return null;
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) return null;
  const days = Math.max(0, Math.ceil((at - now.getTime()) / DAY_MS));
  return t({
    id: 'crew.premium.code.daysLeft',
    message: plural(days, { one: '# day left', other: '# days left' }),
  });
}

/**
 * A crew trip's dates for its row ("Oct 12–19", "Oct 30 – Nov 2"), with the day it is on while
 * it runs ("Oct 12–19 · day 4 of 8"). Null with no start date.
 */
export function tripDatesLine(
  trip: {
    readonly status: string;
    readonly start_date: string | null;
    readonly end_date: string | null;
  },
  now: Date,
  locale: string,
): string | null {
  const start = trip.start_date === null ? null : localDay(trip.start_date);
  if (start === null) return null;
  const end = trip.end_date === null ? null : localDay(trip.end_date);
  const month = new Intl.DateTimeFormat(locale, { month: 'short' });
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric' });
  const full = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const range =
    end === null || end.getTime() === start.getTime()
      ? full.format(start)
      : start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
        ? `${month.format(start)} ${day.format(start)}–${day.format(end)}`
        : `${full.format(start)} – ${full.format(end)}`;
  if (trip.status !== 'in_trip' || end === null) return range;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  const on = Math.min(days, Math.max(1, Math.round((today - start.getTime()) / DAY_MS) + 1));
  return t({ id: 'crew.premium.trip.dayOf', message: `${range} · day ${on} of ${days}` });
}

export function firstName(displayName: string | null): string {
  return memberFirstName(displayName);
}

/** A crew trip's status as one word for its row. */
export function tripStatusWord(status: string): string {
  if (status === 'in_trip') return t({ id: 'crew.premium.trip.on', message: 'On now' });
  if (status === 'voting') return t({ id: 'crew.premium.trip.voting', message: 'Voting' });
  return t({ id: 'crew.premium.trip.planning', message: 'Planning' });
}
