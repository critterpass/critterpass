/**
 * The budget step's pure model: what the crew-level row (`trip_budget_aggregates`) lets anyone
 * see (from four maxes only: the band, anonymous dots, under-all and the infeasible flag; below
 * that the count alone), the knob's track and snapping, and the four breakdown bars for a target,
 * run through the same cost engine the server locks with. No max ever enters this file.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire keys and Intl options, never copy. */
import {
  breakdownBars,
  budgetEstimates,
  type BudgetEstimates,
  type BudgetEstimateSource,
  crewFeasibleLow,
  formatNarrowCurrency,
  narrowCurrencySymbol,
  planBreakdown,
  roundEstimate,
} from '@cp/cost-engine';
import { BUDGET_K_MIN } from '@cp/domain';

/** The synced crew-level row, as the local database holds it. */
export interface AggregateRow {
  readonly currency: string;
  readonly maxes_count: number;
  readonly member_count: number;
  readonly band_low_minor: number | null;
  readonly band_high_minor: number | null;
  readonly step_minor: number | null;
  readonly track_high_minor: number | null;
  readonly bucketed_dots: string | null;
  readonly under_all_ok: number | null;
  readonly infeasible: number | null;
}

export type BandView =
  | { readonly kind: 'waiting'; readonly set: number; readonly of: number }
  | {
      readonly kind: 'band';
      readonly set: number;
      readonly of: number;
      readonly lowMinor: number;
      readonly highMinor: number;
      readonly trackHighMinor: number;
      readonly dots: readonly number[] | null;
      readonly underAll: boolean;
    }
  | {
      readonly kind: 'infeasible';
      readonly set: number;
      readonly of: number;
      readonly trackHighMinor: number;
      readonly dots: readonly number[] | null;
    };

function parseDots(value: string | null): readonly number[] | null {
  if (value === null || value === '') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((d): d is number => typeof d === 'number') : null;
  } catch {
    return null;
  }
}

/** What the crew may see from the row; nothing crew-level below four maxes. */
export function bandView(row: AggregateRow | null, memberCount: number): BandView {
  const set = row?.maxes_count ?? 0;
  const of = row?.member_count ?? memberCount;
  if (row === null || set < BUDGET_K_MIN || row.track_high_minor === null) {
    return { kind: 'waiting', set, of };
  }
  const dots = parseDots(row.bucketed_dots);
  if (row.infeasible === 1 || row.band_high_minor === null || row.band_low_minor === null) {
    return { kind: 'infeasible', set, of, trackHighMinor: row.track_high_minor, dots };
  }
  return {
    kind: 'band',
    set,
    of,
    lowMinor: row.band_low_minor,
    highMinor: row.band_high_minor,
    trackHighMinor: row.track_high_minor,
    dots,
    underAll: row.under_all_ok === 1,
  };
}

/** The band route's body (`BudgetBandWire` + track high) as the same row shape. */
export function rowFromBandWire(body: unknown): AggregateRow | null {
  const wire = body as Record<string, unknown> | null;
  if (wire === null || typeof wire !== 'object' || typeof wire['currency'] !== 'string') {
    return null;
  }
  const num = (key: string): number | null => {
    const value = wire[key];
    return typeof value === 'number' ? value : null;
  };
  const infeasible = wire['infeasible'] === true;
  return {
    currency: wire['currency'],
    maxes_count: num('maxes_count') ?? 0,
    member_count: num('member_count') ?? 0,
    band_low_minor: infeasible ? null : num('low_minor'),
    band_high_minor: infeasible ? null : num('high_minor'),
    step_minor: num('step_minor'),
    track_high_minor: num('track_high_minor'),
    bucketed_dots: Array.isArray(wire['dots']) ? JSON.stringify(wire['dots']) : null,
    under_all_ok: wire['under_all_ok'] === true ? 1 : 0,
    infeasible: infeasible ? 1 : 0,
  };
}

export interface Track {
  readonly minMinor: number;
  readonly maxMinor: number;
  readonly stepMinor: number;
}

/**
 * With nothing priced (no fare, no reviewed cost of the place) the track is sized from the trip's
 * length in the crew's own spoken step, so it reads as money someone would say for those days:
 * up to six steps a day (₫3,000,000 or $300 a day), starting at two (₫1,000,000 or $100 a day).
 */
const UNPRICED_STEPS_PER_DAY = 6;
const UNPRICED_START_STEPS_PER_DAY = 2;
/** The trip length assumed before the dates are locked. */
const UNPRICED_DEFAULT_DAYS = 3;
const UNPRICED_MAX_DAYS = 30;

function unpricedDays(days: number | null): number {
  if (days === null || !Number.isFinite(days) || days < 1) return UNPRICED_DEFAULT_DAYS;
  return Math.min(UNPRICED_MAX_DAYS, Math.round(days));
}

export function estimatesOf(source: BudgetEstimateSource | null): BudgetEstimates | null {
  if (source === null) return null;
  try {
    return budgetEstimates(source);
  } catch {
    return null;
  }
}

/**
 * The knob's track in `stepMinor` steps (see `./lock-step` for where the step comes from). `days`
 * is the trip's length, used only when nothing is priced.
 */
export function trackOf(
  band: BandView,
  estimates: BudgetEstimates | null,
  stepMinor: number,
  days: number | null = null,
): Track {
  const low = estimates === null ? null : crewFeasibleLow(estimates);
  const floor = low === null ? 0 : Math.floor(Number(low.amountMinor) / stepMinor) * stepMinor;
  // Unpriced: the track starts one step in, so the knob can never rest on a budget of nothing.
  const minMinor = floor > 0 || band.kind !== 'waiting' ? floor : stepMinor;
  const maxMinor =
    band.kind !== 'waiting'
      ? band.trackHighMinor
      : floor > 0
        ? Math.ceil((floor * 5) / 2 / stepMinor) * stepMinor
        : stepMinor * UNPRICED_STEPS_PER_DAY * unpricedDays(days);
  return { minMinor, maxMinor: Math.max(maxMinor, minMinor + stepMinor), stepMinor };
}

/** True when the track came from the trip's length alone: nothing is priced and no band shows. */
export function isUnpriced(band: BandView, estimates: BudgetEstimates | null): boolean {
  if (band.kind !== 'waiting') return false;
  const low = estimates === null ? null : crewFeasibleLow(estimates);
  return low === null || Number(low.amountMinor) <= 0;
}

/**
 * The track stretched to hold an amount typed above its end. Only where no band limits the pick
 * (below four maxes): with a band, the top of the track is the crew's and stays put.
 */
export function widenTrack(track: Track, band: BandView, amountMinor: number | null): Track {
  if (amountMinor === null || band.kind !== 'waiting' || amountMinor <= track.maxMinor) {
    return track;
  }
  return { ...track, maxMinor: Math.ceil(amountMinor / track.stepMinor) * track.stepMinor };
}

/**
 * A typed amount in whole units of the currency ("4.000.000", "4,000,000", "4000000", "1,350.50")
 * as minor units, or null when it holds no number. Separators are the reader's own, so anything
 * that is not a digit is dropped; a trailing one- or two-digit part after a separator is read as
 * cents only for a currency that has them.
 */
export function typedAmountMinor(text: string, currency: string): number | null {
  const digits = fractionDigits(currency);
  const whole = digits > 0 ? text.trim().replace(/[.,]\d{1,2}$/u, '') : text;
  const number = whole.replace(/\D/gu, '');
  if (number === '') return null;
  const value = Number(number) * 10 ** digits;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function snap(valueMinor: number, track: Track): number {
  const clamped = Math.min(track.maxMinor, Math.max(track.minMinor, valueMinor));
  return Math.round(clamped / track.stepMinor) * track.stepMinor;
}

/**
 * Where the knob starts: a locked target, else the middle of the band, else (priced) a third
 * along, else (nothing priced) two steps a day of the trip.
 */
export function initialTarget(
  band: BandView,
  track: Track,
  locked: number | null,
  unpricedForDays: number | null | undefined = undefined,
): number {
  if (locked !== null) return snap(locked, widenTrack(track, band, locked));
  if (band.kind === 'band') {
    return snap(Math.floor((band.lowMinor + band.highMinor) / 2), track);
  }
  if (unpricedForDays !== undefined) {
    return snap(
      track.stepMinor * UNPRICED_START_STEPS_PER_DAY * unpricedDays(unpricedForDays),
      track,
    );
  }
  return snap(track.minMinor + (track.maxMinor - track.minMinor) / 3, track);
}

export interface Bars {
  readonly flights: number;
  readonly stays: number;
  readonly food: number;
  readonly fun: number;
  readonly stayMix: readonly { readonly type: string; readonly nights: number }[] | null;
  /** False when nobody's flight is priced: the target then covers the stay, food and fun. */
  readonly flightsPriced: boolean;
}

/** The four bars for `targetMinor` (summing to it exactly), or null when nothing is priced. */
export function barsFor(targetMinor: number, estimates: BudgetEstimates | null): Bars | null {
  if (estimates === null || targetMinor <= 0) return null;
  const target = { amountMinor: BigInt(targetMinor), currency: estimates.currency };
  const plan = planBreakdown(target, estimates);
  const bars = breakdownBars(target, plan);
  if (bars === null) return null;
  const exact = {
    flights: Number(bars.flights.amountMinor),
    stays: Number(bars.stays.amountMinor),
    food: Number(bars.food.amountMinor),
    fun: Number(bars.fun.amountMinor),
    stayMix: plan.stayMix,
    flightsPriced: !plan.missing.includes('flights'),
  };
  // Flights, stays and food read as estimates (rounded like every estimate); fun is what is left
  // of the target, so the four still add up to it exactly.
  const flights = Number(roundEstimate(bars.flights).amountMinor);
  const stays = Number(roundEstimate(bars.stays).amountMinor);
  const food = Number(roundEstimate(bars.food).amountMinor);
  const fun = targetMinor - flights - stays - food;
  return fun < 0 ? exact : { ...exact, flights, stays, food, fun };
}

export function fractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** "$1,350": whole units in the currency's own short symbol, as the locale places it. */
export function money(locale: string, amountMinor: number, currency: string): string {
  return formatNarrowCurrency(
    locale,
    Math.round(amountMinor / 10 ** fractionDigits(currency)),
    currency,
    { maximumFractionDigits: 0 },
  );
}

/** The currency's symbol ("$", "₫"). */
export function currencySymbol(_locale: string, currency: string): string {
  return narrowCurrencySymbol(currency);
}
