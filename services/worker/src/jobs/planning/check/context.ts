/**
 * Everything one plan check run reads, once, as the system: the crew's current plan version, or
 * the organiser's private draft while the crew has no plan yet, the trip's people, the stay each night, rain (the stored forecast
 * inside the horizon, else the usual chance), crowd curves and month factors, stored legs, the
 * places' own hours, crew-visible booking deadlines and the check's limits.
 */
import {
  knownHours,
  PLANNING_CONFIG_DEFAULTS,
  planCheckThresholdsSchema,
  toLocalWallTime,
  weatherSnapshotBodySchema,
} from '@cp/domain';
import {
  assembleFitContext,
  crowdWeeks,
  DEFAULT_FIT_THRESHOLDS,
  forecastByDate,
  layeredTravel,
  legKey,
  monthFactors,
  rainFor,
  straightLineTravel,
  type CheckBooking,
  type CheckPlace,
  type CheckThresholds,
  type CrowdCurveRow,
  type FitContext,
  type FitItemRow,
  type FitLeg,
  type FitPoint,
  type FitRain,
} from '@cp/planner';
import { tripStay } from '@cp/db';
import type pg from 'pg';

export interface CheckTrip {
  readonly id: string;
  readonly crewId: string;
  readonly tz: string;
  readonly destinationId: string | null;
  readonly slug: string | null;
  readonly versionId: string | null;
  /** The version checked is an organiser's private draft: what is found stays with organisers. */
  readonly privateDraft: boolean;
  readonly driveFactor: number;
}

export interface LoadedCheck {
  readonly trip: CheckTrip;
  readonly context: FitContext;
  readonly places: Map<string, CheckPlace>;
  readonly bookings: CheckBooking[];
  readonly thresholds: CheckThresholds;
  readonly maxRunsPerDay: number;
}

export async function readCheckTrip(tx: pg.PoolClient, tripId: string): Promise<CheckTrip | null> {
  const { rows } = await tx.query<CheckTrip>(
    `SELECT t.id, t.crew_id AS "crewId", coalesce(t.tz, d.tz, 'UTC') AS tz,
            t.destination_id AS "destinationId", d.slug,
            coalesce(t.current_version_id, t.draft_version_id) AS "versionId",
            (t.current_version_id IS NULL AND t.draft_version_id IS NOT NULL) AS "privateDraft",
            coalesce(d.drive_factor, 1)::float8 AS "driveFactor"
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1 AND t.phase IN ('planning', 'pre', 'in')`,
    [tripId],
  );
  return rows[0] ?? null;
}

async function config(tx: pg.PoolClient) {
  const { rows } = await tx.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM ops.ops_config
      WHERE key IN ('plan.check.thresholds', 'routing.walk_max_m', 'plan.check.max_runs_per_trip_day')`,
  );
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  const parsed = planCheckThresholdsSchema.safeParse(value('plan.check.thresholds'));
  const limits = parsed.success ? parsed.data : PLANNING_CONFIG_DEFAULTS['plan.check.thresholds'];
  const walk = Number(value('routing.walk_max_m'));
  const runs = Number(value('plan.check.max_runs_per_trip_day'));
  return {
    limits,
    walkMaxM: Number.isFinite(walk) && walk > 0 ? walk : DEFAULT_FIT_THRESHOLDS.walkMaxM,
    maxRuns:
      Number.isFinite(runs) && runs > 0
        ? runs
        : PLANNING_CONFIG_DEFAULTS['plan.check.max_runs_per_trip_day'],
  };
}

async function participants(tx: pg.PoolClient, trip: CheckTrip): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string; seat: boolean }>(
    `SELECT m.user_id, coalesce(p.holds_seat, false) AS seat FROM crew_members m
       LEFT JOIN trip_participants p ON p.trip_id = $1 AND p.user_id = m.user_id
      WHERE m.crew_id = $2 AND m.status = 'active' ORDER BY m.user_id`,
    [trip.id, trip.crewId],
  );
  const seats = rows.filter((row) => row.seat).map((row) => row.user_id);
  return seats.length > 1 ? seats : rows.map((row) => row.user_id);
}

/** The night's stay by the one rule fit and the stored legs use: a booked crew stay wins. */
async function stayFor(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
  date: string,
): Promise<FitPoint | null> {
  const stay = await tripStay(tx, tripId, date, versionId);
  return stay === null ? null : { lat: stay.lat, lng: stay.lng };
}

async function rainByDate(tx: pg.PoolClient, trip: CheckTrip, dates: readonly string[], now: Date) {
  const normals = new Map(
    (
      await tx.query<{ month: number; rain_pct: number[] }>(
        `SELECT DISTINCT ON (month) month, rain_pct FROM climate_normals
          WHERE destination_id = $1 ORDER BY month, computed_at DESC`,
        [trip.destinationId],
      )
    ).rows.map((row) => [row.month, row.rain_pct] as const),
  );
  const today = toLocalWallTime(now, trip.tz).date;
  const snapshots = await tx.query<{ hourly: unknown }>(
    `SELECT hourly FROM weather_snapshots
      WHERE destination_id = $1 AND point_key = 'centroid' AND date >= $2::date - 1`,
    [trip.destinationId, today],
  );
  const hours = snapshots.rows.flatMap((row) => {
    const body = weatherSnapshotBodySchema.safeParse(row.hourly);
    return body.success ? body.data.hours : [];
  });
  const forecast = forecastByDate(hours, trip.tz);
  const rain = new Map<string, FitRain>();
  for (const date of dates) {
    const day = rainFor(date, today, forecast, normals);
    if (day !== null) rain.set(date, day);
  }
  return rain;
}

async function bookingDeadlines(tx: pg.PoolClient, tripId: string): Promise<CheckBooking[]> {
  const { rows } = await tx.query<{
    id: string;
    deadline: Date;
    kind: 'free_cancel' | 'hold_expiry';
  }>(
    `SELECT id, free_cancel_until AS deadline, 'free_cancel' AS kind FROM bookings
      WHERE trip_id = $1 AND visibility = 'crew' AND status = 'booked' AND deleted_at IS NULL
        AND free_cancel_until IS NOT NULL
     UNION ALL
     SELECT id, hold_valid_until, 'hold_expiry' FROM supplier_orders
      WHERE trip_id = $1 AND status = 'holding' AND hold_valid_until IS NOT NULL`,
    [tripId],
  );
  return rows.map((row) => ({ bookingId: row.id, deadline: row.deadline, kind: row.kind }));
}

async function placesOf(tx: pg.PoolClient, poiIds: readonly string[]) {
  const ids = [...new Set(poiIds)];
  const [hours, curves] = await Promise.all([
    tx.query<{ id: string; hours: unknown }>(
      'SELECT id, hours FROM pois WHERE id = ANY($1::uuid[])',
      [ids],
    ),
    tx.query<CrowdCurveRow>(
      `SELECT poi_id, dow, hourly, source, approved_at FROM crowd_forecasts
        WHERE poi_id = ANY($1::uuid[]) AND source IN ('visits', 'editorial')`,
      [ids],
    ),
  ]);
  const weeks = crowdWeeks(curves.rows);
  return new Map<string, CheckPlace>(
    hours.rows.map((row) => [
      row.id,
      { hours: knownHours(row.hours), crowds: weeks.get(row.id) ?? null },
    ]),
  );
}

/** One run's inputs; idea fits read the same context. */
export async function loadCheck(
  tx: pg.PoolClient,
  trip: CheckTrip,
  now: Date,
): Promise<LoadedCheck> {
  const settings = await config(tx);
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
                    (i.booking_id IS NOT NULL OR i.locked_reason IS NOT NULL) AS locked, i.is_outdoor,
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
    const stay = versionId === null ? null : await stayFor(tx, trip.id, versionId, date);
    if (stay !== null) stays.set(date, stay);
  }
  const stored = new Map<string, FitLeg>(
    legs.map((leg) => [
      legKey(leg.from_key, leg.to_key),
      { minutes: leg.minutes, mode: leg.mode === 'walk' ? 'walk' : 'drive', approx: leg.approx },
    ]),
  );
  const factors =
    trip.destinationId === null
      ? []
      : (
          await tx.query<{ month: number; crowd_index: number }>(
            'SELECT month, crowd_index FROM season_months WHERE destination_id = $1 AND reviewed_at IS NOT NULL',
            [trip.destinationId],
          )
        ).rows;
  const { limits } = settings;
  const context = assembleFitContext({
    tz: trip.tz,
    participants: await participants(tx, trip),
    driveFactor: trip.driveFactor,
    days,
    items,
    stays,
    rain: trip.destinationId === null ? new Map() : await rainByDate(tx, trip, dates, now),
    monthFactors: monthFactors(factors),
    thresholds: {
      rainPct: limits.rain_pct,
      normalRainPct: limits.normal_rain_pct,
      busyLevel: limits.busy_level,
      walkMaxM: settings.walkMaxM,
    },
    travel: layeredTravel(stored, straightLineTravel(trip.driveFactor, settings.walkMaxM)),
  });
  return {
    trip,
    context,
    places: await placesOf(
      tx,
      items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id])),
    ),
    bookings: await bookingDeadlines(tx, trip.id),
    thresholds: {
      tooFarDayMin: limits.too_far_day_min,
      tooFarLegMin: limits.too_far_leg_min,
      rainPct: limits.rain_pct,
      normalRainPct: limits.normal_rain_pct,
      busyLevel: limits.busy_level,
      paceStopsPer9h: limits.pace_stops_per_9h,
    },
    maxRunsPerDay: settings.maxRuns,
  };
}
