/**
 * The hub's words built from rows: the tiles' values and captions (PLAN, BOOKINGS, MONEY) and the
 * ticker's lines ("Alex edited the plan"), in the active locale.
 */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import { clockIn, deadlineOf, type LeaveByRow } from '../leave-by/model';
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

/** The trip's latest step in the traveller's words, from the status it moved to. */
export function statusLine(status: string | null, organiser = true): string {
  // A draft is the organiser's alone until she sends it: a member only hears a plan is coming.
  if (status === 'draft_review' && !organiser) {
    return t({
      id: 'trip.hub.ticker.status.planning',
      message: 'The plan is still being worked on',
    });
  }
  switch (status) {
    case 'voting':
      return t({ id: 'trip.hub.ticker.status.voting', message: 'The vote is open' });
    case 'won':
      return t({ id: 'trip.hub.ticker.status.won', message: 'The place is picked' });
    case 'setup':
      return t({ id: 'trip.hub.ticker.status.setup', message: 'The trip is being set up' });
    case 'drafting':
    case 'redrafting':
      return t({ id: 'trip.hub.ticker.status.drafting', message: 'The plan is being drafted' });
    case 'draft_review':
      return t({ id: 'trip.hub.ticker.status.yourDraft', message: 'Your draft is ready' });
    case 'proposed':
      return t({ id: 'trip.hub.ticker.status.proposed', message: 'The plan is out to the crew' });
    case 'confirmed':
    case 'pre_trip':
      return t({ id: 'trip.hub.ticker.status.confirmed', message: 'The plan is locked in' });
    case 'in_trip':
      return t({ id: 'trip.hub.ticker.status.inTrip', message: 'The trip has started' });
    case 'post_trip':
    case 'archived':
      return t({ id: 'trip.hub.ticker.status.over', message: 'The trip is over' });
    case 'cancelled':
      return t({ id: 'trip.hub.ticker.status.cancelled', message: 'The trip was called off' });
    case null:
    default:
      return t({ id: 'trip.hub.ticker.moved', message: 'The trip moved to its next step' });
  }
}

/**
 * The ticker's lines, newest first: each activity in words, with the trip's steps told once, as
 * the step it is on now (the events don't say which step each was), and no line said twice.
 */
export function tickerLines<Row extends Pick<ActivityRow, 'verb' | 'actor_name'>>(
  rows: readonly Row[],
  status: string | null,
  organiser = true,
): { readonly row: Row; readonly text: string }[] {
  const said = new Set<string>();
  const lines: { row: Row; text: string }[] = [];
  let step = false;
  for (const row of rows) {
    if (row.verb === 'moved') {
      if (step) continue;
      step = true;
    }
    const text = row.verb === 'moved' ? statusLine(status, organiser) : activityLine(row);
    if (said.has(text)) continue;
    said.add(text);
    lines.push({ row, text });
  }
  return lines;
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
  /* eslint-disable lingui/no-unlocalized-strings -- date literals, never copy. */
  const days = Math.round(
    (Date.parse(`${dayDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  /* eslint-enable lingui/no-unlocalized-strings */
  const what =
    days <= 0
      ? t({ id: 'trip.hub.next', message: 'Next up' })
      : days === 1
        ? t({ id: 'trip.hub.tomorrow', message: 'Tomorrow' })
        : shortDay(locale, dayDate);
  return entryLabel(what, time);
}

/**
 * Today's leave-by as the hub's entry labels it, from the leave-by model's deadline: "Leave by ·
 * 03:10" with travel worked out, "Be at the airport by · 05:05" or "Be there by · 09:00" without.
 * The one place the hub words a leave-by.
 */
export function leaveByLabel(leaveBy: LeaveByRow, locale: string): string {
  const deadline = deadlineOf(leaveBy);
  const what =
    deadline.kind === 'leave_by'
      ? t({ id: 'trip.hub.leaveByToday', message: 'Leave by' })
      : deadline.airport
        ? t({ id: 'trip.hub.beAtAirportBy', message: 'Be at the airport by' })
        : t({ id: 'trip.hub.beThereBy', message: 'Be there by' });
  return entryLabel(what, clockIn(deadline.at, leaveBy.tz, locale));
}

/**
 * "Oct 12–19" for a trip's dates inside one month, "Sep 27 – Oct 3" across two: the shared
 * interval formatter, which also covers Hermes having no `Intl.DateTimeFormat#formatRange`.
 */
export function tripDates(locale: string, start: string, end: string | null): string {
  /* eslint-disable lingui/no-unlocalized-strings -- date literals and Intl options. */
  const at = (date: string) => new Date(`${date}T12:00:00Z`);
  return format.dateInterval(locale, at(start), at(end ?? start), {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  });
  /* eslint-enable lingui/no-unlocalized-strings */
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
