/**
 * The storm screen's words (3k-8), read in the active language at render. Option titles and
 * details are written here from the planner's facts and amounts, so every day name and number on
 * screen is the server's and a refund or a moved seat is only ever stated from the option's own
 * data.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values and fact keys, never copy. */
import { formatMoney, money } from '@cp/cost-engine';
import { format, upper } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import type { SeatState, StormModel, StormOptionData, StormOptionId } from './model';

const fact = (option: StormOptionData, key: string) => String(option.facts[key] ?? '');

/**
 * A day's weekday in the reader's language ("Thứ Sáu", "Friday"), from its date. The planner's own
 * day labels are English, so they are only the fallback when an option carries no date.
 */
export function weekdayName(
  date: string | null | undefined,
  fallback: string,
  locale: string,
): string {
  if (date === null || date === undefined || date === '') return fallback;
  return format.date(locale, new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', weekday: 'long' });
}

const stormDayName = (option: StormOptionData, locale: string) =>
  weekdayName(option.storm_day, fact(option, 'from') || fact(option, 'day'), locale);
const swapDayName = (option: StormOptionData, locale: string) =>
  weekdayName(option.swap_day, fact(option, 'to'), locale);

export function chips(model: StormModel, locale: string): string[] {
  const out: string[] = [];
  const waves = model.facts['waves_m'];
  const wind = model.facts['wind_kmh'];
  const rain = model.facts['rain_pct'];
  const level = model.facts['volcano_level'];
  if (waves !== undefined) {
    out.push(t({ id: 'trip.disruptions.storm.chip.waves', message: `Waves ${waves}m` }));
  }
  if (wind !== undefined) {
    out.push(t({ id: 'trip.disruptions.storm.chip.wind', message: `Wind ${wind} km/h` }));
  }
  if (rain !== undefined) {
    out.push(t({ id: 'trip.disruptions.storm.chip.rain', message: `Rain ${rain}%` }));
  }
  if (level !== undefined) {
    out.push(t({ id: 'trip.disruptions.storm.chip.volcano', message: `Alert level ${level}` }));
  }
  return out.map((chip) => upper(chip, locale));
}

export function dayEyebrow(day: string | null, locale: string): string {
  if (day === null) return '';
  return upper(
    format.date(locale, new Date(`${day}T12:00:00Z`), {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    locale,
  );
}

export function optionTitle(option: StormOptionData, locale: string): string {
  const title = fact(option, 'title');
  switch (option.id) {
    case 'swap': {
      const from = stormDayName(option, locale);
      const to = swapDayName(option, locale);
      return upper(
        t({ id: 'trip.disruptions.storm.option.swap', message: `Swap ${from} and ${to}` }),
        locale,
      );
    }
    case 'keep': {
      const day = stormDayName(option, locale);
      return upper(t({ id: 'trip.disruptions.storm.option.keep', message: `Keep ${day}` }), locale);
    }
    case 'skip':
      return upper(
        t({ id: 'trip.disruptions.storm.option.skip', message: `Skip ${title}` }),
        locale,
      );
  }
}

function moneyLine(option: StormOptionData, locale: string): string | null {
  const amount = option.per_person_minor;
  if (amount === null || amount === 0 || option.currency === null) return null;
  const sum = formatMoney(money(BigInt(Math.abs(Math.round(amount))), option.currency), {
    locale,
    mode: 'local',
  });
  return amount < 0
    ? t({ id: 'trip.disruptions.storm.backEach', message: `${sum} back each.` })
    : t({ id: 'trip.disruptions.storm.moreEach', message: `${sum} more each.` });
}

export function optionDetail(option: StormOptionData, locale: string): string {
  const parts: string[] = [];
  const title = fact(option, 'title');
  const to = swapDayName(option, locale);
  if (option.id === 'swap') {
    parts.push(
      t({ id: 'trip.disruptions.storm.detail.swap', message: `${title} moves to ${to}.` }),
    );
    if (option.supplier === 'viator_rebook') {
      parts.push(
        t({
          id: 'trip.disruptions.storm.detail.rebook',
          message: 'The booker confirms and pays the new date; the old booking is cancelled after.',
        }),
      );
    } else if (option.supplier === 'partner_link') {
      parts.push(
        t({
          id: 'trip.disruptions.storm.detail.partner',
          message: 'The booking is changed with the seller.',
        }),
      );
    } else {
      parts.push(t({ id: 'trip.disruptions.storm.detail.noFee', message: 'No fee.' }));
    }
  } else if (option.id === 'keep') {
    parts.push(
      t({
        id: 'trip.disruptions.storm.detail.keep',
        message: 'The plan stays. It may not run on the day.',
      }),
    );
  } else {
    parts.push(
      t({ id: 'trip.disruptions.storm.detail.skip', message: `${title} comes off the plan.` }),
    );
    if (option.supplier !== 'none' && option.per_person_minor === null) {
      parts.push(
        t({
          id: 'trip.disruptions.storm.detail.refundUnknown',
          message: 'Refund depends on the booking policy.',
        }),
      );
    }
  }
  const each = moneyLine(option, locale);
  if (each !== null) parts.push(each);
  return parts.join(' ');
}

export function pickTag(guide: string, locale: string): string {
  return upper(t({ id: 'trip.disruptions.storm.picks', message: `${guide} picks` }), locale);
}

export function ctaLabel(option: StormOptionData | null, locale: string): string {
  if (option === null) return t({ id: 'trip.disruptions.storm.cta.none', message: 'Pick one' });
  switch (option.id) {
    case 'swap':
      return t({ id: 'trip.disruptions.storm.cta.swap', message: 'Swap the days' });
    case 'keep':
    case 'skip':
      return optionTitle(option, locale);
  }
}

export function tallyLine(
  model: StormModel,
  option: StormOptionData | null,
  locale: string,
): string {
  const voters = model.voterIds.length;
  const top = model.tally[0];
  if (top === undefined || option === null) {
    return t({ id: 'trip.disruptions.storm.tally.none', message: 'Nobody has voted yet.' });
  }
  const count = top.count;
  const what = optionTitle(option, locale).toLocaleLowerCase(locale);
  return t({
    id: 'trip.disruptions.storm.tally.some',
    message: plural(voters, {
      one: `${count} of # said ${what}.`,
      other: `${count} of # said ${what}.`,
    }),
  });
}

export function votedLabel(id: StormOptionId): string {
  switch (id) {
    case 'swap':
      return t({ id: 'trip.disruptions.storm.voted.swap', message: 'You voted to swap.' });
    case 'keep':
      return t({ id: 'trip.disruptions.storm.voted.keep', message: 'You voted to keep it.' });
    case 'skip':
      return t({ id: 'trip.disruptions.storm.voted.skip', message: 'You voted to skip it.' });
  }
}

export function decidedLine(id: StormOptionId): string {
  switch (id) {
    case 'swap':
      return t({
        id: 'trip.disruptions.storm.decided.swap',
        message: 'The crew swapped the days.',
      });
    case 'keep':
      return t({ id: 'trip.disruptions.storm.decided.keep', message: 'The plan stays as it was.' });
    case 'skip':
      return t({ id: 'trip.disruptions.storm.decided.skip', message: 'The crew skipped it.' });
  }
}

export function seatLine(state: SeatState, booker: string, mine: boolean, date: string): string {
  switch (state) {
    case 'awaiting_booker_payment':
      return mine
        ? t({
            id: 'trip.disruptions.storm.seat.pay',
            message: `Confirm and pay for ${date}. Your old booking is cancelled only after.`,
          })
        : t({
            id: 'trip.disruptions.storm.seat.waiting',
            message: `Waiting on ${booker} to confirm and pay for ${date}.`,
          });
    case 'seats_not_confirmed':
      return t({
        id: 'trip.disruptions.storm.seat.notConfirmed',
        message: `Seats for ${date} weren't confirmed. The old booking is kept.`,
      });
    case 'moved':
      return t({
        id: 'trip.disruptions.storm.seat.moved',
        message: `Booked for ${date}. The old booking is cancelled.`,
      });
    case 'cancel_failed':
      return t({
        id: 'trip.disruptions.storm.seat.cancelFailed',
        message: `Booked for ${date}. The old booking could not be cancelled yet; we are on it.`,
      });
    case 'change_on_partner':
      return t({
        id: 'trip.disruptions.storm.seat.partner',
        message: 'Change the booking with the seller you bought it from.',
      });
    case 'booker_cancel':
      return mine
        ? t({
            id: 'trip.disruptions.storm.seat.cancelMine',
            message: 'Cancel the booking from your wallet.',
          })
        : t({
            id: 'trip.disruptions.storm.seat.cancelWaiting',
            message: `Waiting on ${booker} to cancel the booking.`,
          });
  }
}

export function longDate(date: string | null, locale: string): string {
  if (date === null) return '';
  return format.date(locale, new Date(`${date}T12:00:00Z`), { timeZone: 'UTC', weekday: 'long' });
}

export function closesLine(closesAt: string, tz: string, locale: string): string {
  const time = format.date(locale, new Date(closesAt), {
    timeZone: tz,
    weekday: 'short',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  });
  return t({ id: 'trip.disruptions.storm.closes', message: `Vote closes ${time}.` });
}

export const stormLines = () => ({
  pickOne: t({ id: 'trip.disruptions.storm.pickOne', message: 'Pick one' }),
  back: t({ id: 'trip.disruptions.storm.back', message: 'Forecast' }),
  withdrawn: t({
    id: 'trip.disruptions.storm.withdrawn',
    message: 'The forecast improved. The plan stays as it was.',
  }),
  notVoting: t({
    id: 'trip.disruptions.storm.notVoting',
    message: "You're not on this one, so the others decide.",
  }),
  confirmPay: t({ id: 'trip.disruptions.storm.confirmPay', message: 'Confirm & pay' }),
  offline: t({
    id: 'trip.disruptions.storm.offline',
    message: "You're offline. Your vote goes out when you're back.",
  }),
  missingTitle: t({ id: 'trip.disruptions.storm.missingTitle', message: 'All sorted' }),
  missing: t({ id: 'trip.disruptions.storm.missing', message: 'Nothing to decide here any more.' }),
  backAction: t({ id: 'trip.disruptions.storm.backAction', message: 'Back' }),
});
