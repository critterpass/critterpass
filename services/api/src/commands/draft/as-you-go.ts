/**
 * The guide drafts as the answers come in. The organiser may draft with what is in (`start_draft`
 * before every member has answered); once she has the guide's draft, a member's new answer (their
 * free days, their max, their way there, a must-do) starts a fresh private draft from everything
 * that is in now. Her own edits are never written over: once she has edited the draft by hand, or
 * restored an older one, new answers wait for her to draft again. One draft at a time (an answer
 * that lands while the guide is drafting is shown to her as new since the draft) and at most four
 * drafts of the trip a day. Runs as the server, in the answer's transaction.
 */
import { startAgentJob } from '@cp/ai';
import { emitEvent, sendInTx } from '@cp/db';
import { DRAFT_QUEUES, DRAFT_STEP_IDS } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

const DRAFTS_A_DAY = 4;

interface RefreshFacts {
  readonly crew_id: string;
  readonly status: string;
  readonly destination_id: string | null;
  readonly start_date: string | null;
  readonly current_version_id: string | null;
  readonly origin: string | null;
  readonly organiser_id: string | null;
  readonly live: boolean;
  readonly today: number;
  readonly drafts: number;
}

/** Starts a fresh draft when the trip is waiting on the guide's own draft; answers its job id. */
export async function draftAgainWithNewAnswers(
  tx: pg.PoolClient,
  tripId: string,
  actorId: string,
): Promise<string | null> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<RefreshFacts>(
      `SELECT t.crew_id, t.status, t.destination_id, t.start_date::text AS start_date,
              t.current_version_id, v.origin,
              (SELECT p.user_id FROM trip_participants p
                WHERE p.trip_id = t.id AND p.role = 'organiser'
                ORDER BY p.created_at LIMIT 1) AS organiser_id,
              EXISTS (SELECT 1 FROM agent_jobs j WHERE j.trip_id = t.id
                         AND j.kind IN ('draft', 'redraft') AND j.status IN ('queued', 'running'))
                AS live,
              (SELECT count(*) FROM agent_jobs j WHERE j.trip_id = t.id AND j.kind = 'draft'
                  AND j.created_at > now() - interval '1 day')::int AS today,
              (SELECT count(*) FROM agent_jobs j WHERE j.trip_id = t.id AND j.kind = 'draft')::int
                AS drafts
         FROM trips t LEFT JOIN itinerary_versions v ON v.id = t.draft_version_id
        WHERE t.id = $1 FOR UPDATE OF t`,
      [tripId],
    );
    const trip = rows[0];
    if (
      trip === undefined ||
      trip.status !== 'draft_review' ||
      trip.current_version_id !== null ||
      trip.origin !== 'guide' ||
      trip.destination_id === null ||
      trip.start_date === null ||
      trip.organiser_id === null ||
      trip.live ||
      trip.today >= DRAFTS_A_DAY
    ) {
      return null;
    }
    const job = await startAgentJob(
      tx,
      (queue, data, options) => sendInTx(tx, queue, data, options),
      {
        kind: 'draft',
        queue: DRAFT_QUEUES.draft,
        userId: trip.organiser_id,
        tripId,
        input: { trip_id: tripId, draft_seq: trip.drafts + 1 },
        stepIds: DRAFT_STEP_IDS,
      },
    );
    await tx.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [tripId]);
    await emitEvent(tx, {
      type: 'draft.requested',
      aggregateKind: 'trip',
      aggregateId: tripId,
      actorKind: 'user',
      actorId,
      crewId: trip.crew_id,
      tripId,
      payload: { trip_id: tripId, job_id: job.id },
    });
    return job.id;
  });
}
