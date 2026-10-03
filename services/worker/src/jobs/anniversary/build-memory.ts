/**
 * The trip's year-later memory (3m-10): one per trip, anchored on its recap, made when the first
 * traveller's anniversary comes round and shared by the rest. The line calls back a real moment
 * from the recap, from code: the before-sunrise start on the best day, else the best day itself,
 * else the trip's days and crew. The highlight photo is the album's best pick from that day (else
 * its best pick at all); a trip without photos gets none and the app draws the guide's
 * illustration.
 */
import { recapStatsSchema, type RecapStats } from '@cp/domain';
import type pg from 'pg';

/** The memory's line, from the recap's stats and the place. */
export function memoryLine(place: string, stats: RecapStats): string {
  const best = stats.best_day;
  const sunrise =
    stats.superlatives.find((s) => best !== null && s.local_date === best.local_date) ??
    stats.superlatives[0];
  if (sunrise !== undefined) {
    return `A year ago today: ${place}. Up and out at ${sunrise.local_time} for ${sunrise.name}.`;
  }
  if (best !== null) {
    return `A year ago today: ${place}, day ${best.day_no} of ${stats.days}. The day you all still talk about.`;
  }
  return `A year ago today: ${place}, ${stats.days} days, ${stats.travellers} of you.`;
}

/** The album's best pick from `localDate`, else its best pick: its display copy's key. */
export async function highlightPhoto(
  tx: pg.PoolClient,
  tripId: string,
  localDate: string,
): Promise<string | null> {
  const { rows } = await tx.query<{ key: string }>(
    `SELECT coalesce(p.display_key, p.media_key) AS key
       FROM album_picks ap JOIN photos p ON p.id = ap.photo_id
      WHERE ap.trip_id = $1 AND ap.picked AND p.deleted_at IS NULL
      ORDER BY (p.local_date = $2::date) DESC NULLS LAST, ap.rank NULLS LAST, p.id
      LIMIT 1`,
    [tripId, localDate],
  );
  return rows[0]?.key ?? null;
}

export interface TripMemory {
  readonly id: string;
  readonly tripId: string;
}

/** The trip's anniversary memory, made once (a second traveller's anniversary finds it). */
export async function ensureTripMemory(
  tx: pg.PoolClient,
  recapId: string,
): Promise<TripMemory | null> {
  const { rows } = await tx.query<{
    trip_id: string;
    stats: unknown;
    place: string | null;
  }>(
    `SELECT r.trip_id, r.stats, d.name AS place
       FROM recaps r JOIN trips t ON t.id = r.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE r.id = $1`,
    [recapId],
  );
  const recap = rows[0];
  if (recap === undefined) return null;
  const stats = recapStatsSchema.safeParse(recap.stats);
  if (!stats.success) return null;
  const localDate = stats.data.best_day?.local_date ?? stats.data.start_date;
  const photo = await highlightPhoto(tx, recap.trip_id, localDate);
  const { rows: made } = await tx.query<{ id: string }>(
    `INSERT INTO memories (trip_id, anchor_kind, anchor_id, text, local_date, photo_media_key)
     VALUES ($1, 'anniversary', $2, $3, $4, $5)
     ON CONFLICT (trip_id, anchor_kind, anchor_id) DO UPDATE SET trip_id = EXCLUDED.trip_id
     RETURNING id`,
    [recap.trip_id, recapId, memoryLine(recap.place ?? 'your trip', stats.data), localDate, photo],
  );
  const id = made[0]?.id;
  return id === undefined ? null : { id, tripId: recap.trip_id };
}
