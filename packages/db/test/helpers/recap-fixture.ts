import type pg from 'pg';

import { withSystem } from '../../src/tx';
import { insertCrewMember, insertUser, setCrewMemberStatus } from './actors';

/**
 * Recap rows on the fixture trip: a ready recap whose viewers are the organiser, the co-organiser
 * and the member; awards for the organiser and the member, and each one's MVP vote for the other;
 * the organiser's stamp signed by the member; the trip's anniversary memory with the member's
 * reaction; and the organiser's anniversary timer. The outsider and the ex-member view nothing.
 */
export async function seedRecapRows(
  tx: pg.PoolClient,
  f: {
    readonly tripId: string;
    readonly crewId: string;
    readonly organiser: string;
    readonly coOrganiser: string;
    readonly member: string;
  },
): Promise<void> {
  const recap = await tx.query<{ id: string }>(
    `INSERT INTO recaps (trip_id, crew_id, status, version, ended_on, ready_at, built_at)
     VALUES ($1, $2, 'ready', 1, '2026-10-19', now(), now()) RETURNING id`,
    [f.tripId, f.crewId],
  );
  const recapId = recap.rows[0]!.id;
  await tx.query(
    `INSERT INTO recap_views (recap_id, trip_id, user_id)
     SELECT $1, $2, viewer FROM unnest($3::uuid[]) AS viewer`,
    [recapId, f.tripId, [f.organiser, f.coOrganiser, f.member]],
  );
  const awards = await tx.query<{ id: string; user_id: string }>(
    `INSERT INTO recap_awards (recap_id, trip_id, user_id, kind, metric, value)
     VALUES ($1, $2, $3, 'planner', 'plan_edits', 14), ($1, $2, $4, 'treasurer', 'expenses_logged', 23)
     RETURNING id, user_id`,
    [recapId, f.tripId, f.organiser, f.member],
  );
  const awardOf = (uid: string) => awards.rows.find((row) => row.user_id === uid)!.id;
  await tx.query(
    `INSERT INTO recap_mvp_votes (recap_id, trip_id, voter_id, award_id)
     VALUES ($1, $2, $3, $4), ($1, $2, $5, $6)`,
    [recapId, f.tripId, f.organiser, awardOf(f.member), f.member, awardOf(f.organiser)],
  );
  const stamp = await tx.query<{ id: string }>(
    "SELECT id FROM stamps WHERE user_id = $1 AND kind = 'home'",
    [f.organiser],
  );
  await tx.query(
    `INSERT INTO stamp_signatures (stamp_id, trip_id, recap_id, signer_id, stroke_media_key)
     VALUES ($1, $2, $3, $4, 'signatures/matrix-probe.json')`,
    [stamp.rows[0]!.id, f.tripId, recapId, f.member],
  );
  const memory = await tx.query<{ id: string }>(
    `INSERT INTO memories (trip_id, anchor_kind, anchor_id, text, local_date)
     VALUES ($1, 'anniversary', $2, 'A year ago today, six of you on top of a volcano.', '2026-10-15')
     RETURNING id`,
    [f.tripId, recapId],
  );
  await tx.query(
    `INSERT INTO memory_reactions (memory_id, trip_id, user_id, emoji, text)
     VALUES ($1, $2, $3, '❤', 'again??')`,
    [memory.rows[0]!.id, f.tripId, f.member],
  );
  await tx.query(
    `INSERT INTO anniversaries (trip_id, recap_id, user_id, fire_on, tz, fire_at)
     VALUES ($1, $2, $3, '2027-10-15', 'Asia/Makassar', '2027-10-15T01:00:00Z')`,
    [f.tripId, recapId, f.organiser],
  );
}

/**
 * A crewmate of the fixture crew added for one test file: `viewer` gives them a viewer row on the
 * fixture recap (they travelled), `left` then takes them out of the crew.
 */
export async function addRecapCrewmate(
  pool: pg.Pool,
  f: { readonly crewId: string; readonly tripId: string },
  options: { readonly viewer: boolean; readonly left: boolean },
): Promise<string> {
  return withSystem(pool, async (tx) => {
    const uid = await insertUser(tx);
    await insertCrewMember(tx, { crewId: f.crewId, userId: uid });
    if (options.viewer) {
      await tx.query(
        `INSERT INTO recap_views (recap_id, trip_id, user_id)
         SELECT id, trip_id, $2 FROM recaps WHERE trip_id = $1`,
        [f.tripId, uid],
      );
    }
    if (options.left) {
      await setCrewMemberStatus(tx, { crewId: f.crewId, userId: uid, status: 'left' });
    }
    return uid;
  });
}
