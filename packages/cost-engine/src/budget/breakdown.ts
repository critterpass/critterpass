/**
 * The budget breakdown that re-flows as the knob moves (3c-5): flights from the viewer's quote,
 * stays from the richest stay mix that fits, food at the destination's daily rate, and fun as
 * whatever is left (never below the daily fun floor). Pure and synchronous, so the client runs it
 * on every knob frame and the server stores the same numbers.
 */
import { allocate } from '../money/allocate';
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';
import { chooseStayMix, type StayMixPart } from './stay-mix';

/** A destination's editorial cost index (`destination_cost_indices`), in the trip currency. */
export interface CostIndex {
  readonly currency: CurrencyCode;
  readonly stays: readonly {
    readonly type: string;
    readonly nightlyLowMinor: bigint;
    readonly nightlyHighMinor: bigint;
  }[];
  readonly foodPpDayMinor: bigint;
  readonly funPpDayMinor: bigint;
}

export interface BreakdownInput {
  readonly target: Money;
  /** The viewer's flight price; `null` = no fare known. */
  readonly flights: Money | null;
  readonly nights: number;
  readonly days: number;
  /** `null` = no editorial index for this destination yet. */
  readonly index: CostIndex | null;
}

export type BreakdownCategory = 'flights' | 'stays' | 'food' | 'fun';

export interface Breakdown {
  readonly flights: Money | null;
  readonly stays: Money | null;
  readonly food: Money | null;
  readonly fun: Money | null;
  readonly stayMix: readonly StayMixPart[] | null;
  /** Categories with no number (shown as missing, never as zero). */
  readonly missing: readonly BreakdownCategory[];
  /** False when the target is below what the cheapest mix needs. */
  readonly fits: boolean;
}

const of = (amountMinor: bigint, currency: CurrencyCode): Money => ({ amountMinor, currency });

export function budgetBreakdown(input: BreakdownInput): Breakdown {
  const { target, flights, nights, days, index } = input;
  const currency = target.currency;
  if (!index) {
    return {
      flights,
      stays: null,
      food: null,
      fun: null,
      stayMix: null,
      missing: [...(flights ? [] : ['flights' as const]), 'stays', 'food', 'fun'],
      fits: true,
    };
  }
  const flightMinor = flights?.amountMinor ?? 0n;
  const food = index.foodPpDayMinor * BigInt(days);
  const funFloor = index.funPpDayMinor * BigInt(days);
  const mix = chooseStayMix(
    index.stays.map((s) => ({ type: s.type, nightlyPpMinor: s.nightlyHighMinor })),
    nights,
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
    missing: [...(flights ? [] : ['flights' as const]), ...(mix ? [] : ['stays' as const])],
    fits,
  };
}

/**
 * The cheapest workable trip each: flights + cheapest stay's low rate + food + fun floor. With no
 * fare known (dates too near or too far for a cached fare) it is the ground part alone: still a
 * true floor, since no trip costs less than its stay, food and fun. `null` without an index.
 */
export function feasibleLow(input: Omit<BreakdownInput, 'target'>): Money | null {
  const { flights, nights, days, index } = input;
  if (!index || index.stays.length === 0) return null;
  const cheapestNight = index.stays.reduce(
    (min, s) => (s.nightlyLowMinor < min ? s.nightlyLowMinor : min),
    index.stays[0]?.nightlyLowMinor ?? 0n,
  );
  return of(
    (flights?.amountMinor ?? 0n) +
      cheapestNight * BigInt(nights) +
      (index.foodPpDayMinor + index.funPpDayMinor) * BigInt(days),
    index.currency,
  );
}

export interface BreakdownBars {
  readonly flights: Money;
  readonly stays: Money;
  readonly food: Money;
  readonly fun: Money;
}

const BAR_ORDER = ['flights', 'stays', 'food', 'fun'] as const;

/**
 * The four bars under the knob, summing exactly to the target in minor units: each category's
 * share of the breakdown, scaled to the target by largest remainder (so a target below the
 * cheapest mix shrinks every bar rather than overflowing). `null` when nothing is priced yet.
 */
export function breakdownBars(target: Money, breakdown: Breakdown): BreakdownBars | null {
  const weights = BAR_ORDER.map((id) => ({ id, weight: breakdown[id]?.amountMinor ?? 0n }));
  if (target.amountMinor <= 0n || weights.every((w) => w.weight <= 0n)) return null;
  const shares = allocate(
    target,
    weights.map((w) => ({ id: w.id, weight: w.weight > 0n ? w.weight : 0n })),
  );
  const of = (id: (typeof BAR_ORDER)[number]) =>
    shares.find((share) => share.id === id)?.amount ?? {
      amountMinor: 0n,
      currency: target.currency,
    };
  return { flights: of('flights'), stays: of('stays'), food: of('food'), fun: of('fun') };
}
