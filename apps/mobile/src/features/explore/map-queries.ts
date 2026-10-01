/**
 * The Explore map's local reads: a destination's curated places (from the `explore` or the trip's
 * pack stream), which of them crewmates swiped yes on in this trip, and which are in the trip's
 * plan with their day and start.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useLiveRows } from './data/live-rows';
import type { MapPoi } from './map-model';

const POIS_SQL = `SELECT id, name, name_local, category, lat, lng, hours FROM pois
  WHERE destination_id = ? AND lat IS NOT NULL AND lng IS NOT NULL
    AND coalesce(status, 'active') <> 'hidden' AND category <> 'stay'`;
const POIS_TABLES = ['pois'];

interface PoiRow {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: string | null;
}

function parse(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function useDestinationPois(destinationId: string | null): {
  readonly places: readonly MapPoi[];
  readonly loaded: boolean;
} {
  const live = useLiveRows<PoiRow>(
    POIS_SQL,
    destinationId === null ? null : [destinationId],
    POIS_TABLES,
  );
  const places = useMemo(
    () =>
      live.rows.map((row): MapPoi => ({
        id: row.id,
        name: row.name,
        nameLocal: row.name_local,
        category: row.category,
        lat: row.lat,
        lng: row.lng,
        hours: parse(row.hours),
      })),
    [live.rows],
  );
  return { places, loaded: live.loaded };
}

const YES_SQL = `SELECT poi_id, user_id FROM swipe_yes_votes WHERE trip_id = ?
  UNION SELECT m.poi_id, NULL FROM swipe_matches m WHERE m.trip_id = ?`;
const YES_TABLES = ['swipe_yes_votes', 'swipe_matches'];

/** Who in the crew said yes to which place, by place id (a match with no names still counts). */
export function useCrewPicks(tripId: string | null): ReadonlyMap<string, readonly string[]> {
  const { rows } = useLiveRows<{ poi_id: string; user_id: string | null }>(
    YES_SQL,
    tripId === null ? null : [tripId, tripId],
    YES_TABLES,
  );
  return useMemo(() => {
    const picks = new Map<string, string[]>();
    for (const row of rows) {
      const who = picks.get(row.poi_id) ?? [];
      if (row.user_id !== null && !who.includes(row.user_id)) who.push(row.user_id);
      picks.set(row.poi_id, who);
    }
    return picks;
  }, [rows]);
}

const PLAN_SQL = `SELECT i.poi_id, d.day_no, i.starts_at FROM trips t
    JOIN plan_items i ON i.version_id = t.current_version_id
    JOIN plan_days d ON d.id = i.day_id
  WHERE t.id = ? AND i.poi_id IS NOT NULL`;
const PLAN_TABLES = ['trips', 'plan_items', 'plan_days'];

export interface PlannedAt {
  readonly dayNo: number;
  readonly startsAt: string | null;
}

/** The places already in the trip's plan, by place id. */
export function usePlannedPlaces(tripId: string | null): ReadonlyMap<string, PlannedAt> {
  const { rows } = useLiveRows<{ poi_id: string; day_no: number; starts_at: string | null }>(
    PLAN_SQL,
    tripId === null ? null : [tripId],
    PLAN_TABLES,
  );
  return useMemo(
    () => new Map(rows.map((row) => [row.poi_id, { dayNo: row.day_no, startsAt: row.starts_at }])),
    [rows],
  );
}
