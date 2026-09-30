/**
 * The watch list's inputs for one trip, read in its transaction: the current plan's items in the
 * next 16 days that weather, sea, a volcano or crowds can hurt, each with the forecast hours of its
 * own point (its 0.1° cell, the destination centroid otherwise), the sea state (centroid only),
 * the destination's volcano level and the place's crowd level at the item's hour.
 */
import {
  CENTROID_POINT_KEY,
  gridPointKey,
  isMarineCategory,
  toLocalWallTime,
  type WatchStatus,
} from '@cp/domain';
import type { WatchSignals, WatchSubject } from '@cp/planner';
import type pg from 'pg';

import { readPointForecast, type PointForecast } from '../../travel-data/forecast-watch';

const HORIZON_DAYS = 16;
const SUMMIT = /\b(mount|gunung|summit|volcano|batur|rinjani|ijen|bromo|agung)\b/iu;

export interface WatchedTrip {
  readonly id: string;
  readonly crewId: string;
  readonly destinationId: string;
  readonly tz: string;
  readonly guide: string | null;
}

export interface WatchInput {
  readonly subject: WatchSubject;
  readonly signals: WatchSignals;
  readonly previous: { readonly id: string; readonly status: WatchStatus } | null;
}

interface ItemRow {
  stable_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  category: string | null;
  is_outdoor: boolean;
  provider_kind: string | null;
  poi_id: string | null;
  lat: number | null;
  lng: number | null;
}

export async function loadWatchInputs(
  tx: pg.PoolClient,
  trip: WatchedTrip,
  now: Date,
): Promise<WatchInput[]> {
  const { rows: items } = await tx.query<ItemRow>(
    `SELECT pi.stable_id, left(coalesce(p.name, pi.notes, initcap(pi.category), 'Plan'), 60) AS title,
            pi.starts_at, pi.ends_at, pi.category, pi.is_outdoor, pr.kind AS provider_kind,
            pi.poi_id, p.lat, p.lng
       FROM plan_items pi
       JOIN trips t ON t.id = pi.trip_id AND t.current_version_id = pi.version_id
       LEFT JOIN pois p ON p.id = pi.poi_id
       LEFT JOIN providers pr ON pr.id = pi.provider_id
      WHERE t.id = $1 AND pi.starts_at BETWEEN $2 AND $2::timestamptz + make_interval(days => $3)
      ORDER BY pi.starts_at, pi.stable_id`,
    [trip.id, now, HORIZON_DAYS],
  );
  const previous = await tx.query<{ id: string; target_ref: string; status: WatchStatus }>(
    'SELECT id, target_ref, status FROM watch_items WHERE trip_id = $1',
    [trip.id],
  );
  const known = new Map(previous.rows.map((row) => [row.target_ref, row]));
  const volcano = await tx.query<{ level: number | null }>(
    `SELECT max(level)::int AS level FROM hazard_alerts
      WHERE destination_id = $1 AND kind = 'volcano' AND (expires_at IS NULL OR expires_at > $2)`,
    [trip.destinationId, now],
  );
  const volcanoLevel = volcano.rows[0]?.level ?? null;
  const points = new Map<string, PointForecast>();
  const forecastAt = async (key: string): Promise<PointForecast> => {
    const cached = points.get(key);
    if (cached !== undefined) return cached;
    const read = await readPointForecast(tx, trip.destinationId, key);
    points.set(key, read);
    return read;
  };
  const centroid = await forecastAt(CENTROID_POINT_KEY);
  const inputs: WatchInput[] = [];
  for (const item of items) {
    const marine = isMarineCategory(item.category) || item.provider_kind === 'boat';
    const summit = SUMMIT.test(item.title) || item.category === 'trek' || item.category === 'hike';
    if (!item.is_outdoor && !marine && !summit && item.poi_id === null) continue;
    const point =
      item.lat === null || item.lng === null
        ? centroid
        : await forecastAt(gridPointKey(item.lat, item.lng));
    const local = toLocalWallTime(item.starts_at, trip.tz);
    inputs.push({
      subject: {
        stableId: item.stable_id,
        title: item.title,
        day: local.date,
        startsAt: item.starts_at,
        endsAt: item.ends_at,
        outdoor: item.is_outdoor,
        marine,
        summit,
      },
      signals: {
        weather: point.weather.length > 0 ? point.weather : centroid.weather,
        marine: centroid.marine,
        volcanoLevel,
        crowd: await crowdAt(tx, item.poi_id, item.starts_at, trip.tz),
      },
      previous: known.get(item.stable_id) ?? null,
    });
  }
  return inputs;
}

async function crowdAt(
  tx: pg.PoolClient,
  poiId: string | null,
  at: Date,
  tz: string,
): Promise<number | null> {
  if (poiId === null) return null;
  const local = toLocalWallTime(at, tz);
  const dow = new Date(`${local.date}T00:00:00Z`).getUTCDay();
  const hour = Number(local.time.slice(0, 2));
  const { rows } = await tx.query<{ level: number | null }>(
    `SELECT hourly[$3 + 1]::int AS level FROM crowd_forecasts
      WHERE poi_id = $1 AND dow = $2 AND fetched_at > now() - interval '90 days'`,
    [poiId, dow, hour],
  );
  return rows[0]?.level ?? null;
}
