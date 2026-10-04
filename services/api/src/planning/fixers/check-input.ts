/**
 * The plan check's input as the caller sees the plan: the fit context (days, items, stays, rain,
 * crowd factors) with stored legs first and straight-line "about" minutes for the rest, the
 * places' own hours and crowd weeks, and the check's limits from server config. The fixer routes
 * and commands read the same input the check job read, so the screens agree with the issue cards.
 */
import { planCheckThresholdsSchema, PLANNING_CONFIG_DEFAULTS } from '@cp/domain';
import {
  layeredTravel,
  straightLineTravel,
  type CheckInput,
  type CheckPlace,
  type CheckThresholds,
} from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  loadFitContext,
  tripFitFacts,
  type LoadedContext,
  type StaySource,
  type TripFitFacts,
} from '../fit/context';
import { readFitPlaces } from '../fit/signals/visit';

export interface FixerDeps {
  readonly stays: StaySource;
  readonly now: () => Date;
}

export interface LoadedCheckInput {
  readonly trip: TripFitFacts;
  readonly loaded: LoadedContext;
  readonly input: CheckInput;
  /** Place names by POI, for the screens. */
  readonly names: ReadonlyMap<string, string>;
}

export async function readCheckThresholds(tx: pg.PoolClient): Promise<CheckThresholds> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>(
      "SELECT value FROM ops.ops_config WHERE key = 'plan.check.thresholds'",
    ),
  );
  const parsed = planCheckThresholdsSchema.safeParse(rows[0]?.value);
  const limits = parsed.success ? parsed.data : PLANNING_CONFIG_DEFAULTS['plan.check.thresholds'];
  return {
    tooFarDayMin: limits.too_far_day_min,
    tooFarLegMin: limits.too_far_leg_min,
    rainPct: limits.rain_pct,
    normalRainPct: limits.normal_rain_pct,
    busyLevel: limits.busy_level,
    paceStopsPer9h: limits.pace_stops_per_9h,
  };
}

/** The trip's check input; `dayId` must be a day of a plan the caller can see. */
export async function loadCheckInput(
  tx: pg.PoolClient,
  tripId: string,
  dayId: string | undefined,
  deps: FixerDeps,
): Promise<LoadedCheckInput> {
  const now = deps.now();
  const trip = await tripFitFacts(tx, tripId, dayId);
  const loaded = await loadFitContext(tx, trip, { stays: deps.stays, now });
  const straight = straightLineTravel(loaded.context.driveFactor, loaded.thresholds.walkMaxM);
  const poiIds = [
    ...new Set(
      loaded.context.days.flatMap((day) =>
        day.items.flatMap((item) => (item.poiId === null ? [] : [item.poiId])),
      ),
    ),
  ];
  const facts = await readFitPlaces(tx, trip.id, poiIds, loaded.inPlan);
  const places = new Map<string, CheckPlace>(
    facts.map(({ place }) => [place.poiId, { hours: place.hours, crowds: place.crowds ?? null }]),
  );
  return {
    trip,
    loaded,
    input: {
      context: { ...loaded.context, travel: layeredTravel(loaded.storedLegs, straight) },
      places,
      bookings: [],
      thresholds: await readCheckThresholds(tx),
      now,
    },
    names: new Map(facts.map(({ row }) => [row.id, row.name])),
  };
}
