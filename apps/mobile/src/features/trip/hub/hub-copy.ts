/**
 * The hub's words built from rows: the tiles' values and captions (PLAN, BOOKINGS, MONEY) and the
 * ticker's lines ("Alex edited the plan"), in the active locale.
 */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import { clockIn } from '../leave-by/model';
import type { ActivityRow } from './data/use-hub';

export function tileTitles() {
  return {
    plan: t({ id: 'trip.hub.tile.plan', message: 'Plan' }),
    bookings: t({ id: 'trip.hub.tile.bookings', message: 'Bookings' }),
    money: t({ id: 'trip.hub.tile.money', message: 'Money' }),
  };
}

export function landsAt(time: string): string {
  return t({ id: 'trip.hub.lands', message: `Lands ${time}` });
}

export function planTile(days: number, votes: number) {
  return {
    value: t({
      id: 'trip.hub.tile.days',
      message: plural(days, { one: '# day', other: '# days' }),
    }),
    caption:
      votes === 0
        ? t({ id: 'trip.hub.tile.noVotes', message: 'Nothing to vote on' })
        : t({
            id: 'trip.hub.tile.votes',
            message: plural(votes, { one: '# vote open', other: '# votes open' }),
          }),
  };
}

export function bookingsTile(count: number, allOffline: boolean) {
  return {
    value: t({ id: 'trip.hub.tile.saved', message: `${count} saved` }),
    caption:
      count === 0
        ? t({ id: 'trip.hub.tile.noBookings', message: 'Add your first booking' })
        : allOffline
          ? t({ id: 'trip.hub.tile.allOffline', message: 'all offline' })
          : t({ id: 'trip.hub.tile.online', message: 'saved in your wallet' }),
  };
}

export function moneyTile(amount: string | null, sign: number) {
  if (amount === null || sign === 0) {
    return {
      value: t({ id: 'trip.hub.tile.settled', message: 'Even' }),
      caption: t({ id: 'trip.hub.tile.allSettled', message: 'all settled' }),
    };
  }
  return sign > 0
    ? { value: `+${amount}`, caption: t({ id: 'trip.hub.tile.owed', message: 'owed to you' }) }
    : { value: amount, caption: t({ id: 'trip.hub.tile.youOwe', message: 'you owe' }) };
}

/**
 * A ticker line per activity verb. The row's `text` is the event's i18n id (`activity.trip_created`),
 * never copy, so the line comes from the verb; a verb this build doesn't know reads as an update.
 */
export function activityLine(row: Pick<ActivityRow, 'verb' | 'actor_name'>): string {
  const name = row.actor_name ?? t({ id: 'trip.hub.ticker.someone', message: 'Someone' });
  switch (row.verb) {
    case 'joined':
      return t({ id: 'trip.hub.ticker.joined', message: `${name} joined the crew` });
    case 'left':
      return t({ id: 'trip.hub.ticker.left', message: `${name} left the crew` });
    case 'removed':
      return t({ id: 'trip.hub.ticker.removed', message: `${name} removed someone from the crew` });
    case 'created':
      return t({ id: 'trip.hub.ticker.created', message: `${name} started the trip` });
    case 'moved':
      return t({ id: 'trip.hub.ticker.moved', message: 'The trip moved to its next step' });
    case 'drafted':
      return t({ id: 'trip.hub.ticker.drafted', message: 'A new plan is ready' });
    case 'proposed':
      return t({ id: 'trip.hub.ticker.proposed', message: `${name} suggested a change` });
    case 'applied':
      return t({ id: 'trip.hub.ticker.applied', message: 'A change made it into the plan' });
    case 'reverted':
      return t({ id: 'trip.hub.ticker.reverted', message: `${name} took back a change` });
    case 'rejected':
      return t({ id: 'trip.hub.ticker.rejected', message: `${name} turned down a change` });
    case 'undid':
      return t({ id: 'trip.hub.ticker.undid', message: `${name} undid a guide's change` });
    case 'edited':
      return t({ id: 'trip.hub.ticker.edited', message: `${name} edited the plan` });
    case 'rsvped':
      return t({ id: 'trip.hub.ticker.rsvped', message: `${name} answered the invite` });
    case 'took_seat':
      return t({ id: 'trip.hub.ticker.tookSeat', message: `${name} took a seat` });
    case 'asked':
      return t({ id: 'trip.hub.ticker.asked', message: `${name} started a vote` });
    case 'pitched':
      return t({ id: 'trip.hub.ticker.pitched', message: `${name} pitched a place` });
    case 'decided':
      return t({ id: 'trip.hub.ticker.decided', message: 'A vote closed' });
    default:
      return t({ id: 'trip.hub.ticker.other', message: `${name} updated the trip` });
  }
}

/** "First day · Oct 21", "Your flight · 17:00": what the hub's entry is, then its day or time. */
export function entryLabel(what: string, when: string): string {
  return `${what} · ${when}`;
}

/**
 * The next stop's label: "Next up · 10:00" when it is today, "Tomorrow · 10:00" the day after and
 * "Oct 24 · 10:00" for a later day, so a stop on another day never reads as today's.
 */
export function nextUpLabel(locale: string, today: string, dayDate: string, time: string): string {
  const days = Math.round(
    (Date.parse(`${dayDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  const what =
    days <= 0
      ? t({ id: 'trip.hub.next', message: 'Next up' })
      : days === 1
        ? t({ id: 'trip.hub.tomorrow', message: 'Tomorrow' })
        : shortDay(locale, dayDate);
  return entryLabel(what, time);
}

/**
 * Today's leave-by as the hub's entry labels it: what kind of deadline it is and its time. The
 * one place the hub words a leave-by.
 */
export function leaveByLabel(
  leaveBy: { readonly leave_at: string; readonly tz: string },
  locale: string,
): string {
  return entryLabel(
    t({ id: 'trip.hub.leaveByToday', message: 'Leave by' }),
    clockIn(new Date(leaveBy.leave_at), leaveBy.tz, locale),
  );
}

/**
 * "Oct 12 – Oct 19" for a trip's dates. Hermes has no `Intl.DateTimeFormat#formatRange`, so the two
 * ends are formatted on their own.
 */
export function tripDates(locale: string, start: string, end: string | null): string {
  const last = end ?? start;
  return last === start
    ? shortDay(locale, start)
    : `${shortDay(locale, start)} – ${shortDay(locale, last)}`;
}

/** "Oct 12" for a trip date. */
export function shortDay(locale: string, date: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a date literal and Intl options.
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
}

/** "$186", "Rp 450.000": whole units in the currency's own style. */
export function wholeMoney(locale: string, amountMinor: number, currency: string): string {
  const exponent =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return format.number(locale, Math.abs(amountMinor) / 10 ** exponent, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
}
