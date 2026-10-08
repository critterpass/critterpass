/**
 * The crew's driver pick as a change card reads it (in crew chat, the changes review and the
 * guide's plan card): who the driver is, the days he is asked for and the terms the crew votes
 * on. The terms are the quote put to the vote, or without one the terms he was shortlisted on.
 */
import { isAssignProviderOp, type AssignedDay, type ChangeSetOp, type PriceUnit } from '@cp/domain';
import { t } from '@lingui/core/macro';

import { dayLabel, hoursFigure, money } from '../shared/format';

export interface DriverPickTerms {
  readonly price_minor: number | null;
  readonly currency: string | null;
  readonly price_unit: PriceUnit | null;
  readonly included_hours: number | null;
}

export interface DriverPick {
  /** The driver's name; '' while his row has not synced. */
  readonly name: string;
  readonly days: readonly AssignedDay[];
  readonly terms: DriverPickTerms | null;
}

/** A shortlisted driver as synced with the trip: his name and the terms he was shortlisted on. */
export interface PickedProvider {
  readonly name: string | null;
  readonly terms: DriverPickTerms | null;
}

/** The pick an op carries; null for every other kind of change. */
export function driverPickOf(
  op: ChangeSetOp,
  providers: ReadonlyMap<string, PickedProvider>,
): DriverPick | null {
  if (!isAssignProviderOp(op)) return null;
  const provider = providers.get(op.target);
  const voted = op.assignment.terms;
  return {
    name: provider?.name ?? '',
    days: [...op.assignment.days].sort((a, b) => a.date.localeCompare(b.date)),
    terms:
      voted === undefined
        ? (provider?.terms ?? null)
        : {
            price_minor: voted.price_minor,
            currency: voted.currency,
            price_unit: voted.price_unit,
            included_hours: voted.included_hours,
          },
  };
}

const LISTED_DAYS = 3;

/** "Wed 14, Thu 15", or "5 days from Wed 14" for a long run. */
export function pickDaysLine(days: readonly AssignedDay[], locale: string): string {
  const labels = days.map((day) => dayLabel(day.date, locale));
  const [first] = labels;
  if (first === undefined) return '';
  if (labels.length <= LISTED_DAYS) return labels.join(', ');
  const count = labels.length;
  return t({ id: 'drivers.card.daysFrom', message: `${count} days from ${first}` });
}

/** "Rp 700,000 a day · covers 10 hours"; says so when he gave no price. */
export function pickTermsLine(terms: DriverPickTerms | null, locale: string): string {
  const price = terms === null ? null : money(terms.price_minor, terms.currency, locale);
  if (terms === null || price === null) {
    return t({ id: 'drivers.card.noPrice', message: 'Price not said' });
  }
  const hours = terms.included_hours === null ? null : hoursFigure(terms.included_hours, locale);
  const priced = (() => {
    switch (terms.price_unit) {
      case 'day':
        return t({ id: 'drivers.card.price.day', message: `${price} a day` });
      case 'hours':
        return hours === null
          ? price
          : t({ id: 'drivers.card.price.hours', message: `${price} for ${hours} hours` });
      case 'trip':
        return t({ id: 'drivers.card.price.trip', message: `${price} for the trip` });
      case 'car':
        return t({ id: 'drivers.card.price.car', message: `${price} a car` });
      case 'group':
        return t({ id: 'drivers.card.price.group', message: `${price} for the group` });
      case null:
        return price;
    }
  })();
  if (hours === null || terms.price_unit === 'hours') return priced;
  return `${priced} · ${t({ id: 'drivers.card.covers', message: `covers ${hours} hours` })}`;
}

/** The days and the terms on one line, under the driver's name. */
export function driverPickDetail(pick: DriverPick, locale: string): string {
  return [pickDaysLine(pick.days, locale), pickTermsLine(pick.terms, locale)]
    .filter((part) => part !== '')
    .join(' · ');
}

/** "Minh wants Made as the driver"; the reader's own pick says "You want…". */
export function driverPickTitle(input: {
  readonly pick: DriverPick;
  readonly author: string | null;
  readonly mine: boolean;
}): string {
  const driver =
    input.pick.name === ''
      ? t({ id: 'drivers.card.aDriver', message: 'a driver' })
      : input.pick.name;
  if (input.mine)
    return t({ id: 'drivers.card.titleMine', message: `You want ${driver} to drive` });
  const name = input.author;
  return name === null || name === ''
    ? t({ id: 'drivers.card.titlePlain', message: `${driver} to drive` })
    : t({ id: 'drivers.card.title', message: `${name} wants ${driver} to drive` });
}

type PickErrorKind =
  'needs_signal' | 'driver_gone' | 'days' | 'day_taken' | 'plan_moved' | 'failed';

/** What the sheet says when a pick did not go through. */
export function pickErrorText(
  error: { readonly kind: PickErrorKind; readonly dates?: readonly string[] },
  locale: string,
): string {
  switch (error.kind) {
    case 'needs_signal':
      return t({
        id: 'drivers.pick.error.signal',
        message: 'That needs a connection. Try again when you’re back online.',
      });
    case 'driver_gone':
      return t({
        id: 'drivers.pick.error.gone',
        message: 'This driver is no longer on the shortlist.',
      });
    case 'days':
      return t({
        id: 'drivers.pick.error.days',
        message: 'A day is in there twice. Pick each day once.',
      });
    case 'day_taken': {
      const days = (error.dates ?? []).map((date) => dayLabel(date, locale)).join(', ');
      return days === ''
        ? t({ id: 'drivers.pick.error.taken', message: 'A day just went to another driver.' })
        : t({
            id: 'drivers.pick.error.takenDays',
            message: `${days} just went to another driver. Untick it and try again.`,
          });
    }
    case 'plan_moved':
      return t({
        id: 'drivers.pick.error.moved',
        message: 'The plan just changed. Check the days and try again.',
      });
    case 'failed':
      return t({ id: 'drivers.pick.error.failed', message: 'That didn’t go through. Try again.' });
  }
}
