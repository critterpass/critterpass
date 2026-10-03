/**
 * Fit for a batch of places on a trip. Every place is first fitted on stored legs and straight
 * lines; then only each place's two best insertions are routed (one batched travel call for the
 * whole request) and the places are fitted again on those minutes. Fifty places stay one routing
 * call, and the slow router never sees a pair no answer depends on.
 */
import type { DayFit, PlaceFit } from '@cp/domain';
import {
  fitPlace,
  layeredTravel,
  legKey,
  straightLineTravel,
  type FitContext,
  type FitLeg,
  type FitOptions,
  type FitStop,
} from '@cp/planner';
import type pg from 'pg';

import {
  loadFitContext,
  straightLineSource,
  tripFitFacts,
  type LegPair,
  type StaySource,
  type TravelSource,
} from './context';
import { readFitPlaces } from './signals/visit';

export interface FitDeps {
  readonly stays: StaySource;
  /** The planning router for insertions; straight-line minutes without one. */
  readonly travel?: (driveFactor: number, walkMaxM: number) => TravelSource;
  readonly now: () => Date;
}

const GRADE_RANK = { good: 0, possible: 1, no: 2 } as const;

function stopOf(
  context: FitContext,
  key: string | null | undefined,
  dayId: string,
): FitStop | null {
  const day = context.days.find((entry) => entry.dayId === dayId);
  if (day === undefined) return null;
  if (key === null || key === undefined)
    return day.stay === null ? null : { key: 'stay', ...day.stay };
  const item = day.items.find((entry) => entry.stableId === key);
  return item?.point ? { key, ...item.point } : null;
}

/** The legs a place's two best days hinge on: in from the stop before, out to the stop after. */
export function insertionPairs(context: FitContext, fit: PlaceFit, here: FitStop): LegPair[] {
  const best = [...fit.days]
    .filter((day) => day.grade !== 'no')
    .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || a.day_no - b.day_no)
    .slice(0, 2);
  return best.flatMap((day: DayFit) => {
    const from = stopOf(context, day.insert_after, day.day_id);
    const to = day.insert_before ? stopOf(context, day.insert_before, day.day_id) : null;
    return [
      ...(from === null ? [] : [{ from, to: here }]),
      ...(to === null ? [] : [{ from: here, to }]),
    ];
  });
}

export interface WireContext extends Omit<FitContext, 'travel'> {
  readonly legs: readonly {
    from: string;
    to: string;
    minutes: number;
    mode: string;
    approx: boolean;
  }[];
}

export interface FitResult {
  readonly fits: readonly PlaceFit[];
  /** The context one place was fitted in, so the phone can re-fit it locally. */
  readonly context: WireContext | null;
}

export async function fitForTrip(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly poiIds: readonly string[];
    readonly dayId?: string;
    readonly startsAt?: Date;
    readonly includeContext?: boolean;
  },
  deps: FitDeps,
): Promise<FitResult> {
  const trip = await tripFitFacts(tx, input.tripId, input.dayId);
  const loaded = await loadFitContext(tx, trip, { stays: deps.stays, now: deps.now() });
  const base: FitContext =
    input.dayId === undefined
      ? loaded.context
      : { ...loaded.context, days: loaded.context.days.filter((day) => day.dayId === input.dayId) };
  const places = await readFitPlaces(tx, trip.id, input.poiIds, loaded.inPlan);
  const straight = straightLineTravel(base.driveFactor, loaded.thresholds.walkMaxM);
  const options: FitOptions = input.startsAt === undefined ? {} : { at: input.startsAt };
  const first: FitContext = { ...base, travel: layeredTravel(loaded.storedLegs, straight) };
  const pairs = new Map<string, LegPair>();
  for (const { place } of places) {
    const here = { key: place.poiId, ...place.point };
    for (const pair of insertionPairs(first, fitPlace(first, place, options), here)) {
      const key = legKey(pair.from.key, pair.to.key);
      if (!loaded.storedLegs.has(key)) pairs.set(key, pair);
    }
  }
  const source = (deps.travel ?? straightLineSource)(base.driveFactor, loaded.thresholds.walkMaxM);
  const routed =
    pairs.size === 0 ? new Map<string, FitLeg>() : await source.legs([...pairs.values()]);
  const known = new Map([...loaded.storedLegs, ...routed]);
  const final: FitContext = { ...base, travel: layeredTravel(known, straight) };
  const fits = places.map(({ place }) => fitPlace(final, place, options));
  if (input.includeContext !== true || places.length !== 1) return { fits, context: null };
  const { travel: _travel, ...rest } = final;
  return {
    fits,
    context: {
      ...rest,
      legs: [...known.entries()].map(([key, leg]) => {
        const [from = '', to = ''] = key.split('>');
        return { from, to, minutes: leg.minutes, mode: leg.mode, approx: leg.approx };
      }),
    },
  };
}
