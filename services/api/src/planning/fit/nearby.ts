/**
 * Recommended places (curated, or picked where nothing is) near a place, by travel minutes from it: the 25 nearest in a straight line,
 * then one batched travel call from the place to them, nearest first. Places the caller hid are
 * left out.
 */
import { recommendedSql } from '@cp/db';
import { legKey, type FitStop } from '@cp/planner';
import type pg from 'pg';

import type { TravelSource } from './context';

export const NEARBY_CANDIDATES = 25;

export interface NearbyPlace {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string;
  readonly minutes: number;
  readonly mode: 'walk' | 'drive';
  readonly approx: boolean;
}

export async function nearbyPlaces(
  tx: pg.PoolClient,
  input: { readonly destinationId: string | null; readonly poiId: string; readonly limit: number },
  travel: TravelSource,
): Promise<NearbyPlace[]> {
  const origin = (
    await tx.query<{ lat: number; lng: number }>(
      "SELECT lat, lng FROM pois WHERE id = $1 AND status = 'active'",
      [input.poiId],
    )
  ).rows[0];
  if (origin === undefined || input.destinationId === null) return [];
  const { rows } = await tx.query<{
    id: string;
    name: string;
    category: string;
    lat: number;
    lng: number;
  }>(
    `SELECT p.id, p.name, p.category, p.lat, p.lng FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND ${recommendedSql('p')}
        AND p.merged_into_id IS NULL AND p.id <> $2 AND p.category NOT IN ('stay', 'transit')
        AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = p.id AND h.user_id = app.uid())
      ORDER BY power(p.lat - $3, 2) + power((p.lng - $4) * cos(radians($3)), 2)
      LIMIT $5`,
    [input.destinationId, input.poiId, origin.lat, origin.lng, NEARBY_CANDIDATES],
  );
  const from: FitStop = { key: input.poiId, ...origin };
  const legs = await travel.legs(
    rows.map((row) => ({ from, to: { key: row.id, lat: row.lat, lng: row.lng } })),
  );
  return rows
    .flatMap((row) => {
      const leg = legs.get(legKey(input.poiId, row.id));
      return leg === undefined
        ? []
        : [
            {
              poi_id: row.id,
              name: row.name,
              category: row.category,
              minutes: leg.minutes,
              mode: leg.mode,
              approx: leg.approx,
            },
          ];
    })
    .sort((a, b) => a.minutes - b.minutes || a.name.localeCompare(b.name))
    .slice(0, input.limit);
}
