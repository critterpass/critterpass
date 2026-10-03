import type pg from 'pg';

/**
 * Planning rows on the fixture trip: the organiser's idea, stance and hidden place, a leg and a
 * plan check issue on the crew's current version, the trip's plan check, the organiser's private
 * ask to the member, a climate normal for the probe destination and one route cache entry.
 */
export async function seedPlanningRows(
  tx: pg.PoolClient,
  f: {
    readonly tripId: string;
    readonly versionId: string;
    readonly dayId: string;
    readonly destinationId: string;
    readonly poiId: string;
    readonly organiser: string;
    readonly member: string;
  },
): Promise<void> {
  await tx.query(
    `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, backer_ids, sources, created_by)
     VALUES ($1, $2, 'Matrix Probe POI', 'other', 0, 0, ARRAY[$3]::uuid[], ARRAY['save'], $3)`,
    [f.tripId, f.poiId, f.organiser],
  );
  await tx.query(
    `INSERT INTO place_stances (trip_id, poi_id, user_id, stance, note)
     VALUES ($1, $2, $3, 'want', 'Sunset from the top')`,
    [f.tripId, f.poiId, f.organiser],
  );
  await tx.query('INSERT INTO place_hides (user_id, poi_id) VALUES ($1, $2)', [
    f.organiser,
    f.poiId,
  ]);
  const { rows } = await tx.query<{ stable_id: string }>(
    'SELECT stable_id FROM plan_items WHERE version_id = $1 ORDER BY stable_id LIMIT 1',
    [f.versionId],
  );
  const stop = rows[0]!.stable_id;
  await tx.query(
    `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters, source, approx)
     VALUES ($1, $2, $3, 'stay', $4, 'drive', 25, 14000, 'straight_line', true)`,
    [f.tripId, f.versionId, f.dayId, stop],
  );
  await tx.query(
    `INSERT INTO plan_checks (trip_id, version_id, status, checked_at, fix_count, know_count)
     VALUES ($1, $2, 'done', now(), 1, 0)`,
    [f.tripId, f.versionId],
  );
  await tx.query(
    `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids, params, rank, fingerprint)
     VALUES ($1, $2, 'pace', 'know', $3, ARRAY[$4]::uuid[], '{"stops": 7, "limit": 6}', 0, 'pace:1')`,
    [f.tripId, f.versionId, f.dayId, stop],
  );
  const idea = await tx.query<{ id: string }>('SELECT id FROM trip_ideas WHERE trip_id = $1', [
    f.tripId,
  ]);
  await tx.query(
    `INSERT INTO member_asks (trip_id, asked_by, member_id, idea_ids, ops)
     VALUES ($1, $2, $3, ARRAY[$4]::uuid[], '[]')`,
    [f.tripId, f.organiser, f.member, idea.rows[0]!.id],
  );
  await tx.query(
    `INSERT INTO climate_normals (destination_id, cell, month, rain_pct, source, years)
     VALUES ($1, '0.0,0.0', 10, array_fill(30, ARRAY[24])::smallint[], 'weatherapi_history', 3)`,
    [f.destinationId],
  );
  await tx.query(
    `INSERT INTO route_cache (key, minutes, meters, source) VALUES ('matrix-probe', 25, 14000, 'valhalla')`,
  );
}
