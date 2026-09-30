/**
 * Guide threads for the sheet (docs/product-decisions.md, context guide): a turn names its thread by a client
 * id; an unknown id opens the thread on first use, private (JUST ME) or the trip's group thread
 * (GROUP). Without a trip in the request the context guide is picked: the trip the user is on now,
 * else the next confirmed one, else the latest proposal or draft; none at all is the home guide.
 */
import { withSystem, withUser } from '@cp/db';
import { DomainError, type GuideThreadMode } from '@cp/domain';
import type pg from 'pg';

export interface GuideThread {
  readonly id: string;
  readonly userId: string;
  readonly mode: GuideThreadMode;
  readonly tripId: string | null;
  readonly crewId: string | null;
  /** The trip guide's slug; null for the home guide. */
  readonly guideSlug: string | null;
}

interface ThreadRow {
  readonly id: string;
  readonly user_id: string;
  readonly mode: GuideThreadMode;
  readonly trip_id: string | null;
  readonly crew_id: string | null;
  readonly guide_slug: string | null;
}

const toThread = (row: ThreadRow): GuideThread => ({
  id: row.id,
  userId: row.user_id,
  mode: row.mode,
  tripId: row.trip_id,
  crewId: row.crew_id,
  guideSlug: row.guide_slug,
});

const THREAD_SQL = `SELECT t.id, t.user_id, t.mode, t.trip_id, coalesce(t.crew_id, tr.crew_id) AS crew_id,
       g.slug AS guide_slug
  FROM guide_threads t
  LEFT JOIN trips tr ON tr.id = t.trip_id
  LEFT JOIN guides g ON g.id = coalesce(t.guide_id, tr.guide_id)
 WHERE t.id = $1`;

/** The context guide's trip for the caller, as they see trips through RLS. */
export async function contextTrip(tx: pg.PoolClient): Promise<string | null> {
  const { rows } = await tx.query<{ id: string }>(
    `SELECT t.id FROM trips t
      WHERE app.is_trip_member(t.id) AND t.status NOT IN ('archived', 'cancelled')
      ORDER BY
        CASE
          WHEN t.status = 'in_trip'
            OR (t.start_date <= current_date AND t.end_date >= current_date) THEN 0
          WHEN t.status IN ('confirmed', 'pre_trip') AND coalesce(t.start_date, current_date) >= current_date THEN 1
          WHEN t.status IN ('proposed', 'draft_review', 'drafting', 'redrafting', 'setup') THEN 2
          ELSE 3
        END,
        CASE WHEN t.status IN ('confirmed', 'pre_trip') THEN t.start_date END ASC NULLS LAST,
        t.updated_at DESC
      LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

export interface OpenThreadInput {
  readonly uid: string;
  readonly device: string;
  readonly threadId: string;
  readonly mode: GuideThreadMode;
  readonly tripId: string | null | undefined;
}

/**
 * The thread a turn runs in: an existing one the caller can see, or a new one opened now. An id the
 * caller cannot see answers NOT_FOUND; a second private thread for the same trip answers
 * STATE_INVALID with the existing thread's id.
 */
export async function openThread(pool: pg.Pool, input: OpenThreadInput): Promise<GuideThread> {
  const visible = await withUser(pool, input.uid, input.device, async (tx) => {
    const found = await tx.query<ThreadRow>(THREAD_SQL, [input.threadId]);
    if (found.rows[0] !== undefined) return { thread: toThread(found.rows[0]) };
    const tripId = input.tripId === undefined ? await contextTrip(tx) : input.tripId;
    if (tripId === null) return { tripId: null, crewId: null, guideId: null };
    const trip = await tx.query<{ crew_id: string; guide_id: string | null; member: boolean }>(
      'SELECT crew_id, guide_id, app.is_trip_member(id) AS member FROM trips WHERE id = $1',
      [tripId],
    );
    const row = trip.rows[0];
    if (row === undefined || !row.member) throw new DomainError('NOT_FOUND');
    return { tripId, crewId: row.crew_id, guideId: row.guide_id };
  });
  if ('thread' in visible) return visible.thread;
  if (input.mode === 'group' && visible.tripId === null) {
    throw new DomainError('VALIDATION', { field: 'context.trip_id', reason: 'group_needs_trip' });
  }

  return withSystem(pool, async (tx) => {
    const taken = await tx.query('SELECT 1 FROM guide_threads WHERE id = $1', [input.threadId]);
    if (taken.rowCount !== 0) throw new DomainError('NOT_FOUND');
    const existing = await tx.query<{ id: string }>(
      input.mode === 'group'
        ? "SELECT id FROM guide_threads WHERE mode = 'group' AND trip_id = $2"
        : "SELECT id FROM guide_threads WHERE mode = 'private' AND user_id = $1 AND trip_id IS NOT DISTINCT FROM $2",
      input.mode === 'group' ? [null, visible.tripId] : [input.uid, visible.tripId],
    );
    if (existing.rows[0] !== undefined) {
      throw new DomainError('STATE_INVALID', {
        state: 'thread_exists',
        thread_id: existing.rows[0].id,
      });
    }
    await tx.query(
      `INSERT INTO guide_threads (id, user_id, trip_id, crew_id, guide_id, mode)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.threadId,
        input.uid,
        visible.tripId,
        input.mode === 'group' ? visible.crewId : null,
        visible.guideId,
        input.mode,
      ],
    );
    const { rows } = await tx.query<ThreadRow>(THREAD_SQL, [input.threadId]);
    return toThread(rows[0] as ThreadRow);
  });
}

/** Crewmates with Pass+ (the 4b-1 hint, and what makes a crew-chat ask unmetered). */
export async function crewPassHolders(
  pool: pg.Pool,
  crewId: string | null,
  uid: string,
): Promise<string[]> {
  if (crewId === null) return [];
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ user_id: string }>(
      `SELECT cm.user_id FROM crew_members cm
         JOIN user_entitlements ue ON ue.user_id = cm.user_id
        WHERE cm.crew_id = $1 AND cm.status = 'active' AND cm.user_id <> $2
          AND ue.guide_unlimited_global
        ORDER BY cm.user_id`,
      [crewId, uid],
    );
    return rows.map((row) => row.user_id);
  });
}
