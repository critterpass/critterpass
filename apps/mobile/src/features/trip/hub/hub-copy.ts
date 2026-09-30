/**
 * The hub's words built from rows: the tiles' values and captions (PLAN, BOOKINGS, MONEY) and the
 * ticker's lines ("Alex edited the plan"), in the active locale.
 */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

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

export function activityLine(row: ActivityRow): string {
  if (row.text !== null && row.text !== '') return row.text;
  const name = row.actor_name ?? t({ id: 'trip.hub.ticker.someone', message: 'Someone' });
  switch (row.verb) {
    case 'joined':
      return t({ id: 'trip.hub.ticker.joined', message: `${name} joined the crew` });
    case 'left':
      return t({ id: 'trip.hub.ticker.left', message: `${name} left the crew` });
    case 'created':
      return t({ id: 'trip.hub.ticker.created', message: `${name} started the trip` });
    case 'drafted':
      return t({ id: 'trip.hub.ticker.drafted', message: 'A new plan is ready' });
    case 'proposed':
      return t({ id: 'trip.hub.ticker.proposed', message: `${name} suggested a change` });
    case 'applied':
      return t({ id: 'trip.hub.ticker.applied', message: 'A change made it into the plan' });
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
