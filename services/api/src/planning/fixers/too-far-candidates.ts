/**
 * Places a too-far day could swap a stop for: curated places of the kinds the day's movable stops
 * are, the ten nearest to each of the day's stops and to the night's stay (so "on the way back"
 * is in reach), leaving out places the caller hid. Our own hours only.
 */
import { knownHours } from '@cp/domain';
import type { FitDay, TooFarCandidate } from '@cp/planner';
import type pg from 'pg';

const PER_POINT = 10;

export interface CandidateRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: unknown;
}

export async function tooFarCandidates(
  tx: pg.PoolClient,
  destinationId: string | null,
  day: FitDay,
): Promise<{ candidates: TooFarCandidate[]; names: Map<string, string> }> {
  const categories = [
    ...new Set(
      day.items.flatMap((item) =>
        item.locked || item.category === null || item.category === 'stay' ? [] : [item.category],
      ),
    ),
  ];
  const points = [
    ...(day.stay === null ? [] : [day.stay]),
    ...day.items.flatMap((item) => (item.point === null ? [] : [item.point])),
  ];
  if (destinationId === null || categories.length === 0 || points.length === 0) {
    return { candidates: [], names: new Map() };
  }
  const { rows } = await tx.query<CandidateRow>(
    `SELECT DISTINCT ON (p.id) p.id, p.name, p.category, p.lat, p.lng, p.hours
       FROM unnest($2::float8[], $3::float8[]) AS pt(lat, lng)
       CROSS JOIN LATERAL (
         SELECT c.id, c.name, c.category, c.lat, c.lng, c.hours FROM pois c
          WHERE c.destination_id = $1 AND c.status = 'active' AND c.curation = 'editorial'
            AND c.merged_into_id IS NULL AND c.category = ANY($4::text[])
            AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = c.id AND h.user_id = app.uid())
          ORDER BY power(c.lat - pt.lat, 2) + power((c.lng - pt.lng) * cos(radians(pt.lat)), 2)
          LIMIT $5) p
      ORDER BY p.id`,
    [
      destinationId,
      points.map((point) => point.lat),
      points.map((point) => point.lng),
      categories,
      PER_POINT,
    ],
  );
  return {
    candidates: rows.map((row) => ({
      poiId: row.id,
      category: row.category,
      point: { lat: row.lat, lng: row.lng },
      hours: knownHours(row.hours),
    })),
    names: new Map(rows.map((row) => [row.id, row.name])),
  };
}
