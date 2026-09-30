import type pg from 'pg';

/**
 * Trip day rows on the fixture trip: the organiser's briefing with one item, a shared packing row
 * and the organiser's personal one, a leave-by on the trip's plan item with the organiser's and the
 * member's readiness, the organiser's device alarm, and the trip's offline bundle for one day.
 */
export async function seedTripDayRows(
  tx: pg.PoolClient,
  f: { tripId: string; organiser: string; member: string },
): Promise<void> {
  const briefing = await tx.query<{ id: string }>(
    `INSERT INTO briefings (trip_id, user_id, local_date, tz)
     VALUES ($1, $2, '2026-10-15', 'Asia/Makassar') RETURNING id`,
    [f.tripId, f.organiser],
  );
  await tx.query(
    `INSERT INTO briefing_items (briefing_id, trip_id, user_id, icon, text, action, dedupe_key)
     VALUES ($1, $2, $3, 'ticket', 'Tickets are in Bookings.', 'open', 'matrix-probe')`,
    [briefing.rows[0]!.id, f.tripId, f.organiser],
  );
  await tx.query(
    `INSERT INTO packing_items (trip_id, owner_id, label, created_by)
     VALUES ($1, NULL, 'Headlamp', $2), ($1, $2, 'Contact lenses', $2)`,
    [f.tripId, f.organiser],
  );
  const item = await tx.query<{ id: string; stable_id: string }>(
    'SELECT id, stable_id FROM plan_items WHERE trip_id = $1 ORDER BY id LIMIT 1',
    [f.tripId],
  );
  const leaveBy = await tx.query<{ id: string }>(
    `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, local_date, starts_at,
       leave_at, tz, participant_ids)
     VALUES ($1, $2, $3, '2026-10-15', '2026-10-14T19:30:00Z', '2026-10-14T19:10:00Z',
       'Asia/Makassar', ARRAY[$4, $5]::uuid[]) RETURNING id`,
    [f.tripId, item.rows[0]!.id, item.rows[0]!.stable_id, f.organiser, f.member],
  );
  const leaveById = leaveBy.rows[0]!.id;
  await tx.query(
    `INSERT INTO readiness (leave_by_id, trip_id, user_id) VALUES ($1, $2, $3), ($1, $2, $4)`,
    [leaveById, f.tripId, f.organiser, f.member],
  );
  const device = await tx.query<{ id: string }>(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES (uuidv7(), $1, 'ios', '1.0.0', 'en', 'Asia/Makassar') RETURNING id`,
    [f.organiser],
  );
  await tx.query(
    `INSERT INTO alarms (user_id, device_id, leave_by_id, trip_id, fire_at, state)
     VALUES ($1, $2, $3, $4, '2026-10-14T19:00:00Z', 'scheduled')`,
    [f.organiser, device.rows[0]!.id, leaveById, f.tripId],
  );
  await tx.query(
    `INSERT INTO offline_bundles (trip_id, local_date, content_hash, manifest)
     VALUES ($1, '2026-10-15', 'matrix-probe', '{"assets": []}'::jsonb)`,
    [f.tripId],
  );
}
