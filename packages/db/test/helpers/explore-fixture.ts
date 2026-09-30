import type pg from 'pg';

/**
 * Explore rows on the fixture trip: a live swipe session where the organiser said yes and the
 * member said no to the probe place (so the yes mirror holds the organiser's vote only), a match,
 * an approved tip the member wrote, the trip's Q&A line about the place, the organiser's saved
 * list, and an active sponsored placement with a day's impression count.
 */
export async function seedExploreRows(
  tx: pg.PoolClient,
  f: { tripId: string; destinationId: string; poiId: string; organiser: string; member: string },
): Promise<void> {
  const session = await tx.query<{ id: string }>(
    `INSERT INTO swipe_sessions (trip_id, destination_id, started_by, status, match_rule)
     VALUES ($1, $2, $3, 'live', 2) RETURNING id`,
    [f.tripId, f.destinationId, f.organiser],
  );
  const sessionId = session.rows[0]!.id;
  await tx.query(
    `INSERT INTO swipe_votes (session_id, trip_id, user_id, poi_id, verdict)
     VALUES ($1, $2, $3, $5, 'yes'), ($1, $2, $4, $5, 'no')`,
    [sessionId, f.tripId, f.organiser, f.member, f.poiId],
  );
  await tx.query(
    `INSERT INTO swipe_matches (session_id, trip_id, poi_id, user_ids)
     VALUES ($1, $2, $3, ARRAY[$4::uuid])`,
    [sessionId, f.tripId, f.poiId, f.organiser],
  );
  await tx.query(
    `INSERT INTO place_tips (poi_id, author_id, text, moderation_status)
     VALUES ($1, $2, 'Go at opening time.', 'approved')`,
    [f.poiId, f.member],
  );
  await tx.query(
    `INSERT INTO place_qna_summaries (trip_id, poi_id, text, source_message_id, source_at)
     VALUES ($1, $2, 'The crew wants to go early.', gen_random_uuid(), now())`,
    [f.tripId, f.poiId],
  );
  await tx.query("INSERT INTO saved_lists (user_id, name) VALUES ($1, 'Food')", [f.organiser]);
  const placement = await tx.query<{ id: string }>(
    `INSERT INTO sponsored_placements
       (partner, poi_id, destination_id, list_kinds, starts_at, ends_at, created_by)
     VALUES ('klook', $1, $2, '{picks}', now() - interval '1 day', now() + interval '30 days', $3)
     RETURNING id`,
    [f.poiId, f.destinationId, f.organiser],
  );
  await tx.query(
    `INSERT INTO sponsored_event_counts (placement_id, day, list_kind, kind, count)
     VALUES ($1, current_date, 'picks', 'impression', 1)`,
    [placement.rows[0]!.id],
  );
}
