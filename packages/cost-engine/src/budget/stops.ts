/**
 * The budget of a trip with several stops: every stop is priced from its own cost index over its
 * own nights and days, and the trip is the sum of those whole amounts (never an average rate
 * multiplied back). A stop with no index leaves stays, food and fun missing for the whole trip:
 * a part of the sum is never shown as the total.
 */
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { type Breakdown, type CostIndex } from './breakdown';
import { sortStayRates, type StayMix, type StayMixPart, type StayRate } from './stay-mix';

/** One stop of the trip with its cost index in the crew's currency. */
export interface StopEstimate {
  readonly position: number;
  readonly destinationId: string;
  readonly nights: number;
  /** Its nights, plus one for the last stop: a travel day counts to the stop slept in that night. */
  readonly days: number;
  /** `null` = no reviewed index for this stop, or one that cannot be converted. */
  readonly index: CostIndex | null;
}

type PricedStop = StopEstimate & { readonly index: CostIndex };

/** Each stop's days: its nights, plus the trip's last day for the last stop. */
export function stopDays(nights: readonly number[]): number[] {
  return nights.map((count, index) => count + (index === nights.length - 1 ? 1 : 0));
}

function priced(stops: readonly StopEstimate[]): PricedStop[] | null {
  if (stops.length === 0) return null;
  const all = stops.filter(
    (stop): stop is PricedStop => stop.index !== null && stop.index.stays.length > 0,
  );
  return all.length === stops.length ? all : null;
}

const sum = (amounts: readonly bigint[]): bigint => amounts.reduce((a, b) => a + b, 0n);
const of = (amountMinor: bigint, currency: CurrencyCode): Money => ({ amountMinor, currency });

/** The cheapest workable trip: flights, each stop's cheapest night, food and the fun floor. */
export function stopsFeasibleLow(input: {
  readonly flights: Money | null;
  readonly stops: readonly StopEstimate[];
}): Money | null {
  const stops = priced(input.stops);
  if (stops === null) return null;
  const ground = stops.map((stop) => {
    const cheapestNight = stop.index.stays.reduce(
      (min, stay) => (stay.nightlyLowMinor < min ? stay.nightlyLowMinor : min),
      stop.index.stays[0]?.nightlyLowMinor ?? 0n,
    );
    return (
      cheapestNight * BigInt(stop.nights) +
      (stop.index.foodPpDayMinor + stop.index.funPpDayMinor) * BigInt(stop.days)
    );
  });
  return of(
    (input.flights?.amountMinor ?? 0n) + sum(ground),
    (stops[0] as PricedStop).index.currency,
  );
}

interface StopRates {
  readonly position: number;
  readonly nights: number;
  readonly rates: readonly StayRate[];
}

interface Upgrade {
  /** Index into the stops; -1 for every stop on its cheapest stay. */
  readonly stop: number;
  readonly type: string;
  readonly nights: number;
  readonly costMinor: bigint;
}

/**
 * Every stop on its cheapest stay, plus nights of one better stay in one stop: the richest such
 * mix the allowance covers. Ties go to the earlier stop, then the stay type that sorts first,
 * then more nights of it. Each part names its stop.
 */
export function chooseStopsStayMix(
  stops: readonly StopRates[],
  allowanceMinor: bigint,
): StayMix | null {
  const sorted = stops.map((stop) => sortStayRates(stop.rates));
  if (stops.length === 0 || sorted.some((rates) => rates.length === 0)) return null;
  if (stops.some((stop) => stop.nights <= 0)) return null;
  const cheapest = sorted.map((rates) => rates[0] as StayRate);
  const baseCost = sum(
    stops.map((stop, i) => (cheapest[i] as StayRate).nightlyPpMinor * BigInt(stop.nights)),
  );
  const base: Upgrade = { stop: -1, type: '', nights: 0, costMinor: baseCost };
  const candidates: Upgrade[] = [base];
  stops.forEach((stop, i) => {
    for (const upgrade of (sorted[i] ?? []).slice(1)) {
      const step = upgrade.nightlyPpMinor - (cheapest[i] as StayRate).nightlyPpMinor;
      for (let k = 1; k <= stop.nights; k += 1) {
        candidates.push({
          stop: i,
          type: upgrade.type,
          nights: k,
          costMinor: baseCost + step * BigInt(k),
        });
      }
    }
  });
  const fitting = candidates
    .filter((candidate) => candidate.costMinor <= allowanceMinor)
    .sort((a, b) => {
      if (a.costMinor !== b.costMinor) return a.costMinor > b.costMinor ? -1 : 1;
      if (a.stop !== b.stop) return a.stop - b.stop;
      if (a.type !== b.type) return a.type < b.type ? -1 : 1;
      return b.nights - a.nights;
    });
  const chosen = fitting[0] ?? base;
  const parts: StayMixPart[] = [];
  stops.forEach((stop, i) => {
    const upgraded = chosen.stop === i ? chosen.nights : 0;
    if (upgraded > 0) parts.push({ type: chosen.type, nights: upgraded, stop: stop.position });
    if (stop.nights - upgraded > 0) {
      parts.push({
        type: (cheapest[i] as StayRate).type,
        nights: stop.nights - upgraded,
        stop: stop.position,
      });
    }
  });
  return { parts, costMinor: chosen.costMinor, fits: fitting.length > 0 };
}

/** The breakdown a target gives over every stop: food and the fun floor added stop by stop. */
export function stopsBreakdown(input: {
  readonly target: Money;
  readonly flights: Money | null;
  readonly stops: readonly StopEstimate[];
}): Breakdown {
  const { target, flights } = input;
  const stops = priced(input.stops);
  const noFlight = flights ? [] : ['flights' as const];
  if (stops === null) {
    return {
      flights,
      stays: null,
      food: null,
      fun: null,
      stayMix: null,
      missing: [...noFlight, 'stays', 'food', 'fun'],
      fits: true,
    };
  }
  const currency = target.currency;
  const flightMinor = flights?.amountMinor ?? 0n;
  const food = sum(stops.map((stop) => stop.index.foodPpDayMinor * BigInt(stop.days)));
  const funFloor = sum(stops.map((stop) => stop.index.funPpDayMinor * BigInt(stop.days)));
  const mix = chooseStopsStayMix(
    stops.map((stop) => ({
      position: stop.position,
      nights: stop.nights,
      rates: stop.index.stays.map((s) => ({ type: s.type, nightlyPpMinor: s.nightlyHighMinor })),
    })),
    target.amountMinor - flightMinor - food - funFloor,
  );
  const stays = mix?.costMinor ?? 0n;
  const rest = target.amountMinor - flightMinor - stays - food;
  const fits = (mix?.fits ?? true) && rest >= funFloor;
  return {
    flights,
    stays: mix ? of(stays, currency) : null,
    food: of(food, currency),
    fun: of(fits ? rest : funFloor, currency),
    stayMix: mix?.parts ?? null,
    missing: [...noFlight, ...(mix ? [] : ['stays' as const])],
    fits,
  };
}
