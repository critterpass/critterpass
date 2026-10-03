/**
 * The fit context for a trip, read as the caller (RLS decides what they see): the crew's plan
 * version (a day of an organiser's draft only for organisers, whose RLS shows it), the trip's
 * people, the stay each night, rain and crowd factors, and the stored legs between its stops.
 *
 * Two seams for the travel and stay lanes: a `TravelSource` answers insertion legs (straight-line
 * "about" minutes here; the planning router swaps in) and a `StaySource` names the night's stay
 * (the plan's stay item here; the trip's booked stay swaps in).
 */
import {
  DomainError,
  planCheckThresholdsSchema,
  PLANNING_CONFIG_DEFAULTS,
  TRAVEL_DESTINATIONS,
} from '@cp/domain';
import {
  assembleFitContext,
  DEFAULT_FIT_THRESHOLDS,
  legKey,
  straightLineTravel,
  type FitContext,
  type FitItemRow,
  type FitLeg,
  type FitPoint,
  type FitStop,
  type FitThresholds,
} from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { tripVoters } from '../../plan/access';
import { readRain } from './signals/climate';
import { readMonthFactors } from './signals/crowds';

export interface LegPair {
  readonly from: FitStop;
  readonly to: FitStop;
}

/** Travel for insertions; pairs it cannot answer are left out (the straight line fills them). */
export interface TravelSource {
  legs(pairs: readonly LegPair[]): Promise<Map<string, FitLeg>>;
}

/** Where the crew sleeps on a local date of the trip; null = no anchor. */
export interface StaySource {
  stayFor(
    tx: pg.PoolClient,
    tripId: string,
    versionId: string,
    date: string,
  ): Promise<FitPoint | null>;
}

export function straightLineSource(driveFactor: number, walkMaxM: number): TravelSource {
  const travel = straightLineTravel(driveFactor, walkMaxM);
  return {
    legs: (pairs) => {
      const legs = new Map<string, FitLeg>();
      for (const { from, to } of pairs) {
        const leg = travel(from, to);
        if (leg !== null) legs.set(legKey(from.key, to.key), leg);
      }
      return Promise.resolve(legs);
    },
  };
}

/** The plan's own stay item: the latest on or before the date, else the first after it. */
export const planStaySource: StaySource = {
  async stayFor(tx, _tripId, versionId, date) {
    const { rows } = await tx.query<{ lat: number; lng: number }>(
      `SELECT p.lat, p.lng FROM plan_items i
         JOIN plan_days d ON d.id = i.day_id JOIN pois p ON p.id = i.poi_id
        WHERE i.version_id = $1 AND p.category = 'stay' AND i.status IS DISTINCT FROM 'cancelled'
        ORDER BY (d.date <= $2::date) DESC,
                 CASE WHEN d.date <= $2::date THEN -d.day_no ELSE d.day_no END
        LIMIT 1`,
      [versionId, date],
    );
    const row = rows[0];
    return row === undefined ? null : { lat: row.lat, lng: row.lng };
  },
};

export interface TripFitFacts {
  readonly id: string;
  readonly crewId: string;
  readonly tz: string;
  readonly destinationId: string | null;
  readonly destinationSlug: string | null;
  readonly versionId: string | null;
  readonly organiser: boolean;
  readonly driveFactor: number;
}

/** The trip as a participant sees it; anyone else, or a day they cannot see, is `NOT_FOUND`. */
export async function tripFitFacts(
  tx: pg.PoolClient,
  tripId: string,
  dayId?: string,
): Promise<TripFitFacts> {
  const { rows } = await tx.query<TripFitFacts>(
    `SELECT t.id, t.crew_id AS "crewId", coalesce(t.tz, d.tz, 'UTC') AS tz,
            t.destination_id AS "destinationId", d.slug AS "destinationSlug",
            t.current_version_id AS "versionId", app.is_trip_organiser(t.id) AS organiser,
            coalesce(d.drive_factor, 1)::float8 AS "driveFactor"
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND app.is_trip_member(t.id)
        AND (app.is_trip_organiser(t.id) OR NOT EXISTS (
              SELECT 1 FROM trip_participants p
               WHERE p.trip_id = t.id AND p.user_id = app.uid() AND p.rsvp = 'out'))`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (dayId === undefined) return trip;
  const day = await tx.query<{ version_id: string }>(
    'SELECT version_id FROM plan_days WHERE id = $1 AND trip_id = $2',
    [dayId, tripId],
  );
  const versionId = day.rows[0]?.version_id;
  if (versionId === undefined) throw new DomainError('NOT_FOUND', { reason: 'day' });
  return { ...trip, versionId };
}

/** The rain, crowd and walking limits fit shares with the plan check (server config). */
export async function readFitThresholds(tx: pg.PoolClient): Promise<FitThresholds> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ key: string; value: unknown }>(
      `SELECT key, value FROM ops.ops_config
        WHERE key IN ('plan.check.thresholds', 'routing.walk_max_m')`,
    ),
  );
  const parsed = planCheckThresholdsSchema.safeParse(
    rows.find((row) => row.key === 'plan.check.thresholds')?.value,
  );
  const limits = parsed.success ? parsed.data : PLANNING_CONFIG_DEFAULTS['plan.check.thresholds'];
  const walk = Number(rows.find((row) => row.key === 'routing.walk_max_m')?.value);
  return {
    ...DEFAULT_FIT_THRESHOLDS,
    rainPct: limits.rain_pct,
    normalRainPct: limits.normal_rain_pct,
    busyLevel: limits.busy_level,
    walkMaxM: Number.isFinite(walk) && walk > 0 ? walk : DEFAULT_FIT_THRESHOLDS.walkMaxM,
  };
}

export interface LoadedContext {
  readonly context: FitContext;
  /** Places already in the plan, by POI: their own item never blocks them. */
  readonly inPlan: ReadonlyMap<string, string>;
  /** Stored legs of the version, by `from>to` key. */
  readonly storedLegs: ReadonlyMap<string, FitLeg>;
  readonly thresholds: FitThresholds;
}

export async function loadFitContext(
  tx: pg.PoolClient,
  trip: TripFitFacts,
  deps: { readonly stays: StaySource; readonly now: Date },
): Promise<LoadedContext> {
  const thresholds = await readFitThresholds(tx);
  const versionId = trip.versionId;
  const days =
    versionId === null
      ? []
      : (
          await tx.query<{ day_id: string; day_no: number; date: string | null }>(
            `SELECT id AS day_id, day_no, to_char(date, 'YYYY-MM-DD') AS date
               FROM plan_days WHERE version_id = $1 ORDER BY day_no`,
            [versionId],
          )
        ).rows;
  const items =
    versionId === null
      ? []
      : (
          await tx.query<FitItemRow>(
            `SELECT i.stable_id, i.day_id, i.poi_id, coalesce(p.category, i.category) AS category,
                    i.starts_at, i.ends_at, i.attendee_ids,
                    (i.booking_id IS NOT NULL OR i.locked_reason IS NOT NULL) AS locked,
                    i.is_outdoor,
                    coalesce(p.lat, (i.custom_place->>'lat')::float8) AS lat,
                    coalesce(p.lng, (i.custom_place->>'lng')::float8) AS lng
               FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
              WHERE i.version_id = $1 AND i.status IS DISTINCT FROM 'cancelled'`,
            [versionId],
          )
        ).rows;
  const legs =
    versionId === null
      ? []
      : (
          await tx.query<{
            from_key: string;
            to_key: string;
            minutes: number;
            mode: string;
            approx: boolean;
          }>(
            'SELECT from_key, to_key, minutes, mode, approx FROM plan_legs WHERE version_id = $1',
            [versionId],
          )
        ).rows;
  const dates = days.flatMap((day) => (day.date === null ? [] : [day.date]));
  const stays = new Map<string, FitPoint>();
  for (const date of dates) {
    const stay = versionId === null ? null : await deps.stays.stayFor(tx, trip.id, versionId, date);
    if (stay !== null) stays.set(date, stay);
  }
  const centre =
    trip.destinationSlug === null ? undefined : TRAVEL_DESTINATIONS[trip.destinationSlug]?.centroid;
  const point =
    stays.values().next().value ??
    (centre === undefined ? null : { lat: centre.lat, lng: centre.lng });
  const storedLegs = new Map<string, FitLeg>(
    legs.map((leg) => [
      legKey(leg.from_key, leg.to_key),
      { minutes: leg.minutes, mode: leg.mode === 'walk' ? 'walk' : 'drive', approx: leg.approx },
    ]),
  );
  const context = assembleFitContext({
    tz: trip.tz,
    participants: await tripVoters(tx, trip.id, trip.crewId),
    driveFactor: trip.driveFactor,
    days,
    items,
    stays,
    rain: await readRain(tx, {
      destinationId: trip.destinationId,
      point,
      dates,
      tz: trip.tz,
      now: deps.now,
    }),
    monthFactors: await readMonthFactors(tx, trip.destinationId),
    thresholds,
  });
  const inPlan = new Map(
    items.flatMap((item) => (item.poi_id === null ? [] : [[item.poi_id, item.stable_id] as const])),
  );
  return { context, inPlan, storedLegs, thresholds };
}
