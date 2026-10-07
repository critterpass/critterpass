/** The comparison's model: a shortlisted driver as a candidate, day hours and the risk line copy. */
import {
  carsNeeded,
  type CompareCandidate,
  type CompareDay,
  type CompareRisk,
  type DriverCard,
} from '@cp/domain';
import type { useLingui } from '@lingui/react/macro';

import type { ShortlistDriver } from '../shared/api';
import { dayLabel } from '../shared/format';

type CarPrice = Pick<CompareCandidate, 'priceMinor' | 'priceUnit' | 'includedHours'>;

/**
 * His price as what the whole party pays, which is what the comparison splits. A price per person
 * is paid by each of them, and a price per hour is paid for every hour of the chosen days (at
 * least the hours he asks for, in every car needed); with a day that has no times yet, an hourly
 * rate has no total to compare.
 */
export function partyPrice(
  card: DriverCard,
  days: readonly CompareDay[],
  people: number,
): CarPrice {
  const quoted = {
    priceMinor: card.price_minor,
    priceUnit: card.price_unit,
    includedHours: card.included_hours,
  };
  if (card.price_minor === null) return quoted;
  if (card.price_per === 'person') {
    return {
      ...quoted,
      priceMinor: card.price_minor * people,
      priceUnit: card.price_unit === 'trip' ? 'trip' : 'group',
    };
  }
  if (card.price_per === 'hour') {
    const least = card.included_hours ?? 0;
    const hours = days.map((day) => (day.hours === null ? null : Math.max(day.hours, least)));
    const known = hours.filter((n): n is number => n !== null);
    const total =
      known.length === 0 || known.length < hours.length
        ? null
        : Math.round(
            card.price_minor *
              known.reduce((sum, n) => sum + n, 0) *
              carsNeeded(people, card.seats),
          );
    // The hours he names are the least he drives for, not a day his price covers.
    return { priceMinor: total, priceUnit: 'trip', includedHours: null };
  }
  return quoted;
}

export function candidateOf(
  driver: ShortlistDriver,
  card: DriverCard,
  days: readonly CompareDay[],
  people: number,
): CompareCandidate {
  return {
    id: driver.id,
    name: driver.name,
    ...partyPrice(card, days, people),
    currency: card.currency,
    seats: card.seats,
    includes: card.includes,
    overtimeMinor: card.overtime_minor,
    licenceShown: card.licence_shown,
    supplier: driver.terms.source === 'private_tour',
  };
}

export function hoursBetween(start: string, end: string): number {
  const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
  const span = toMin(end) - toMin(start);
  return (span < 0 ? span + 1440 : span) / 60;
}

export function riskLine(
  t: ReturnType<typeof useLingui>['t'],
  risk: CompareRisk,
  locale: string,
): string {
  const name = risk.name;
  switch (risk.kind) {
    case 'overtime_unknown': {
      const day = dayLabel(risk.date, locale);
      return t({
        id: 'drivers.risk.overtimeUnknown',
        message: `${name}'s cheapest, but ${day} runs longer than his price covers and he hasn't said what overtime costs.`,
      });
    }
    case 'over_hours': {
      const day = dayLabel(risk.date, locale);
      return t({
        id: 'drivers.risk.overHours',
        message: `${name}'s cheapest, but ${day} runs longer than his price covers: count the overtime.`,
      });
    }
    case 'seats_short': {
      const cars = risk.cars;
      return t({
        id: 'drivers.risk.seats',
        message: `${name}'s cheapest, but you'd need ${cars} cars.`,
      });
    }
    case 'not_said': {
      const count = risk.count;
      return t({
        id: 'drivers.risk.notSaid',
        message: `${name}'s cheapest, but ${count} things aren't said yet. Ask before you pick.`,
      });
    }
    case 'all_clear':
      return t({ id: 'drivers.risk.clear', message: `${name}'s cheapest, and everything's said.` });
  }
}
