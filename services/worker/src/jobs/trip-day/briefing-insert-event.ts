/**
 * The briefing's door for other features ("Rin's flight moved… I moved her pickup"): an event item
 * joins each named member's briefing for today on the trip's clock, in the same shape as the
 * morning's lines. It is keyed by its source event, so a replayed event adds nothing; a briefing not
 * built yet is created to hold it and filled in at the member's morning.
 */
import { briefingEventItemSchema, toLocalWallTime, type BriefingEventItem } from '@cp/domain';
import type pg from 'pg';

/** Runs as app_system inside the caller's transaction; resolves to how many items were added. */
export async function insertBriefingItem(
  tx: pg.PoolClient,
  input: BriefingEventItem,
  now: Date = new Date(),
): Promise<number> {
  const item = briefingEventItemSchema.parse(input);
  const { rows } = await tx.query<{ tz: string }>(
    `SELECT coalesce(t.tz, d.tz, 'UTC') AS tz FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [item.trip_id],
  );
  const tz = rows[0]?.tz;
  if (tz === undefined) return 0;
  const localDate = toLocalWallTime(now, tz).date;
  let added = 0;
  for (const userId of item.user_ids) {
    const briefing = await tx.query<{ id: string }>(
      `INSERT INTO briefings (trip_id, user_id, local_date, tz)
       SELECT $1, $2, $3, $4 WHERE EXISTS (
         SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2)
       ON CONFLICT (trip_id, user_id, local_date) DO UPDATE SET tz = briefings.tz
       RETURNING id`,
      [item.trip_id, userId, localDate, tz],
    );
    const briefingId = briefing.rows[0]?.id;
    if (briefingId === undefined) continue;
    const inserted = await tx.query(
      `INSERT INTO briefing_items (briefing_id, trip_id, user_id, position, icon, text, action,
         deep_link, source, source_event_id, dedupe_key)
       VALUES ($1, $2, $3, 100, $4, $5, $6, $7, 'event', $8, $9)
       ON CONFLICT (briefing_id, dedupe_key) DO NOTHING RETURNING id`,
      [
        briefingId,
        item.trip_id,
        userId,
        item.icon,
        item.text,
        item.action,
        item.deep_link,
        item.source_event_id,
        `event:${item.source_event_id}`,
      ],
    );
    added += inserted.rowCount ?? 0;
  }
  return added;
}
