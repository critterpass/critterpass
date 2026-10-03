/**
 * The album contributor: the trip's photo count and who took the most (the recap's photos tile,
 * "312 PHOTOS, Jordan took 140 of them"), each traveller's photos for the human-camera award, and
 * photos per day for the best day. Counts live photos taken (or, without a time, uploaded) inside
 * the trip's dates on its own clock; deleted photos never count.
 */
import type pg from 'pg';

import { addDayScore, addMetric, type RecapContributor, type RecapScope } from './types';

interface Row {
  readonly uploader_id: string;
  readonly local_date: string;
  readonly photos: number;
}

async function loadCounts(tx: pg.PoolClient, scope: RecapScope): Promise<Row[]> {
  const { rows } = await tx.query<Row>(
    `SELECT uploader_id, day::text AS local_date, count(*)::int AS photos
       FROM (
         SELECT uploader_id,
                coalesce(local_date, (coalesce(taken_at, created_at) AT TIME ZONE $2)::date) AS day
           FROM photos WHERE trip_id = $1 AND deleted_at IS NULL
       ) p
      WHERE day BETWEEN $3::date AND $4::date
      GROUP BY uploader_id, day
      ORDER BY uploader_id, day`,
    [scope.trip.id, scope.trip.tz, scope.trip.startDate, scope.trip.endedOn],
  );
  return rows;
}

export const albumContributor: RecapContributor = {
  name: 'album',
  async contribute(tx, scope, draft) {
    const rows = await loadCounts(tx, scope);
    if (rows.length === 0) return;
    const perUploader = new Map<string, number>();
    for (const row of rows) {
      perUploader.set(row.uploader_id, (perUploader.get(row.uploader_id) ?? 0) + row.photos);
      addDayScore(draft, row.local_date, row.photos);
    }
    let top: { user_id: string; count: number } | null = null;
    for (const [userId, count] of [...perUploader.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (scope.members.includes(userId)) addMetric(draft, userId, 'photos', count);
      if (top === null || count > top.count) top = { user_id: userId, count };
    }
    draft.photos = {
      count: [...perUploader.values()].reduce((sum, n) => sum + n, 0),
      top_uploader: top,
    };
  },
};
