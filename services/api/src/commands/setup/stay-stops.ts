/**
 * Which stay the crew sleeps in, night by night, and what a night costs there. On a trip with one
 * stop the stays are priced from the destination's cost index. On a trip with several stops the
 * stays, in order, fill the stops in order: a stay never runs from one stop into the next, and each
 * is priced from the index of the stop it lies in. With no stays sent, every stop gets one stay of
 * the chosen type.
 */
import type { BudgetEstimates, CostIndex } from '@cp/cost-engine';
import { DomainError } from '@cp/domain';

export interface StayInput {
  readonly stay_type: string;
  readonly nights: number;
}

export interface PricedStay extends StayInput {
  /** Per person per night, in the crew's currency. */
  readonly nightlyHighMinor: bigint;
}

function priced(stay: StayInput, index: CostIndex | null | undefined): PricedStay {
  const rate = index?.stays.find((row) => row.type === stay.stay_type);
  if (rate === undefined) {
    throw new DomainError('STATE_INVALID', { reason: 'stay_unavailable', stay: stay.stay_type });
  }
  return { ...stay, nightlyHighMinor: rate.nightlyHighMinor };
}

export function priceStays(
  estimates: BudgetEstimates,
  chosen: { readonly stay_option_id: string; readonly stays?: readonly StayInput[] | undefined },
  nights: number,
): PricedStay[] {
  const stops = estimates.stops;
  const stays =
    chosen.stays ??
    (stops === undefined
      ? [{ stay_type: chosen.stay_option_id, nights }]
      : stops.map((stop) => ({ stay_type: chosen.stay_option_id, nights: stop.nights })));
  if (stays.reduce((sum, stay) => sum + stay.nights, 0) !== nights) {
    throw new DomainError('VALIDATION', { reason: 'stay_nights', nights });
  }
  if (stops === undefined) return stays.map((stay) => priced(stay, estimates.index));
  let at = 0;
  let left = stops[0]?.nights ?? 0;
  return stays.map((stay) => {
    const stop = stops[at];
    if (stop === undefined || stay.nights > left) {
      throw new DomainError('VALIDATION', {
        reason: 'stay_nights',
        nights,
        ...(stop === undefined ? {} : { stop: stop.position, stop_nights: stop.nights }),
      });
    }
    left -= stay.nights;
    if (left === 0) {
      at += 1;
      left = stops[at]?.nights ?? 0;
    }
    return priced(stay, stop.index);
  });
}
