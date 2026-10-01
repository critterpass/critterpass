import type pg from 'pg';

/**
 * Disruption rows on the fixture trip: an open flight delay, a watch item on the trip's plan item,
 * and the organiser's latest running-late check on that item (no coordinates).
 */
export async function seedDisruptionRows(
  tx: pg.PoolClient,
  f: { tripId: string; organiser: string },
): Promise<void> {
  const item = await tx.query<{ id: string; stable_id: string }>(
    'SELECT id, stable_id FROM plan_items WHERE trip_id = $1 ORDER BY id LIMIT 1',
    [f.tripId],
  );
  const { id: itemId, stable_id: stableId } = item.rows[0]!;
  const disruption = await tx.query<{ id: string }>(
    `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, title, summary, facts,
       source_snapshot)
     VALUES ($1, 'flight_delay', 'delay', 'flight:matrix-probe', 'Flight delayed',
       'Three of you land at 13:50.', '{"new_arrival": "13:50"}'::jsonb,
       '{"provider": "aeroapi", "delay_min": 130}'::jsonb)
     RETURNING id`,
    [f.tripId],
  );
  await tx.query(
    `INSERT INTO watch_items (trip_id, kind, target_ref, plan_item_stable_id, day, status, score,
       title)
     VALUES ($1, 'marine', $2, $3, '2026-10-16', 'watching', 40, 'Boat day')`,
    [f.tripId, stableId, stableId],
  );
  await tx.query(
    `INSERT INTO journey_checks (trip_id, item_id, user_id, mode, eta_at, late_min, disruption_id)
     VALUES ($1, $2, $3, 'drive', '2026-10-16T06:25:00Z', 25, $4)`,
    [f.tripId, itemId, f.organiser, disruption.rows[0]!.id],
  );
}
