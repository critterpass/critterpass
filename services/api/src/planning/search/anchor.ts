/**
 * Where "≤ N min" is measured from, and the minutes to each candidate: the stay, a place, or the
 * stops of a day (the nearest stop of that day counts). Minutes come from the planning travel
 * (Valhalla, else straight-line "about" minutes), one batched call for every candidate asked, read
 * as the caller so a day or a stay they cannot see anchors nothing.
 */
import { tripStay } from '@cp/db';
import type { MaxMinutes } from '@cp/domain';
import { legKey, straightLineTravel, type FitLeg, type FitStop } from '@cp/planner';
import type pg from 'pg';

import type { LegPair, TravelSource } from '../fit/context';

export interface SearchMinutes {
  readonly value: number;
  readonly mode: 'walk' | 'drive';
  readonly approx: boolean;
}

/** The stops minutes are measured from; empty when nothing can anchor them. */
export async function anchorStops(
  tx: pg.PoolClient,
  from: MaxMinutes | { readonly from: 'stay' },
  trip: { readonly id: string; readonly versionId: string | null } | null,
  firstDate: string | null,
): Promise<readonly FitStop[]> {
  if (from.from === 'poi') {
    const { rows } = await tx.query<{ lat: number; lng: number }>(
      'SELECT lat, lng FROM pois WHERE id = $1',
      [from.poi_id],
    );
    return rows.map((row) => ({ key: from.poi_id, lat: row.lat, lng: row.lng }));
  }
  if (trip === null) return [];
  if (from.from === 'stay') {
    const stay = await tripStay(tx, trip.id, firstDate ?? undefined, trip.versionId ?? undefined);
    return stay === null ? [] : [{ key: 'stay', lat: stay.lat, lng: stay.lng }];
  }
  const { rows } = await tx.query<{
    key: string | null;
    lat: number | null;
    lng: number | null;
    date: string | null;
  }>(
    `SELECT i.stable_id::text AS key, to_char(d.date, 'YYYY-MM-DD') AS date,
            coalesce(p.lat, (i.custom_place->>'lat')::float8) AS lat,
            coalesce(p.lng, (i.custom_place->>'lng')::float8) AS lng
       FROM plan_days d
       LEFT JOIN plan_items i ON i.day_id = d.id AND i.status IS DISTINCT FROM 'cancelled'
       LEFT JOIN pois p ON p.id = i.poi_id
      WHERE d.id = $1 AND d.trip_id = $2`,
    [from.day_id, trip.id],
  );
  const stops = rows.flatMap((row) =>
    row.key === null || row.lat === null || row.lng === null
      ? []
      : [{ key: row.key, lat: row.lat, lng: row.lng }],
  );
  if (stops.length > 0 || rows.length === 0) return stops;
  const stay = await tripStay(tx, trip.id, rows[0]?.date ?? undefined);
  return stay === null ? [] : [{ key: 'stay', lat: stay.lat, lng: stay.lng }];
}

const roughDistance = (a: FitStop, b: { lat: number; lng: number }) => {
  const dx = (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180);
  return dx * dx + (a.lat - b.lat) ** 2;
};

/** Minutes from the nearest stop to each place, by place id. */
export async function minutesFrom(
  stops: readonly FitStop[],
  places: readonly { readonly id: string; readonly lat: number; readonly lng: number }[],
  travel: TravelSource,
  straight: { readonly driveFactor: number; readonly walkMaxM: number },
): Promise<Map<string, SearchMinutes>> {
  const minutes = new Map<string, SearchMinutes>();
  if (stops.length === 0 || places.length === 0) return minutes;
  const pairs: LegPair[] = places.map((place) => {
    const from = stops.reduce((best, stop) =>
      roughDistance(stop, place) < roughDistance(best, place) ? stop : best,
    );
    return { from, to: { key: place.id, lat: place.lat, lng: place.lng } };
  });
  const routed = await travel.legs(pairs);
  const fallback = straightLineTravel(straight.driveFactor, straight.walkMaxM);
  for (const pair of pairs) {
    const leg: FitLeg | null =
      routed.get(legKey(pair.from.key, pair.to.key)) ?? fallback(pair.from, pair.to);
    if (leg === null) continue;
    minutes.set(pair.to.key, { value: leg.minutes, mode: leg.mode, approx: leg.approx });
  }
  return minutes;
}
