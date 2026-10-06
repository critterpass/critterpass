/** The comparison's model: a shortlisted driver as a candidate, day hours and the risk line copy. */
import type { CompareCandidate, CompareRisk } from '@cp/domain';
import type { useLingui } from '@lingui/react/macro';

import { driverCardOf, type ShortlistDriver } from '../shared/api';
import { dayLabel } from '../shared/format';

export function candidateOf(driver: ShortlistDriver): CompareCandidate {
  const card = driverCardOf(driver);
  return {
    id: driver.id,
    name: driver.name,
    priceMinor: card.price_minor,
    currency: card.currency,
    priceUnit: card.price_unit,
    includedHours: card.included_hours,
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
