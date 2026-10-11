/**
 * What the drafting commands share: the organiser check (as trip setup does it), the trip's live
 * drafting job, and the hints on `trip_draft:{trip_id}` (organisers) and `trip:{trip_id}` (the
 * crew's redraft counter). Writes to agent jobs, versions and reservations run as the server.
 */
import { outbox } from '@cp/db';
import {
  channelName,
  DRAFT_RT,
  REDRAFT_COUNTER_RT,
  type AgentJobKind,
  type DraftDoneHint,
  type RedraftCounterHint,
} from '@cp/domain';
import type pg from 'pg';

import { fromStoredRedraftLimit } from '../../entitlements/materialise';

export { loadSetupTrip, requireOrganiser, requireStatus } from '../setup/shared';

/**
 * The status a trip goes back to when a draft stops without a new one (cancelled or failed): to
 * reviewing the guide's earlier draft when it has one, else to setup. SQL over the row `trips`.
 */
export const STATUS_AFTER_DRAFTING = `CASE WHEN EXISTS (
    SELECT 1 FROM itinerary_versions v WHERE v.trip_id = trips.id AND v.origin = 'guide'
  ) THEN 'draft_review' ELSE 'setup' END`;

export async function liveJob(
  tx: pg.PoolClient,
  tripId: string,
  kind: AgentJobKind,
): Promise<{ id: string; user_id: string | null } | undefined> {
  const { rows } = await tx.query<{ id: string; user_id: string | null }>(
    `SELECT id, user_id FROM agent_jobs
      WHERE trip_id = $1 AND kind = $2 AND status IN ('queued', 'running')
      ORDER BY created_at DESC LIMIT 1`,
    [tripId, kind],
  );
  return rows[0];
}

export function publishDraftDone(
  tx: pg.PoolClient,
  tripId: string,
  hint: DraftDoneHint,
): Promise<unknown> {
  return outbox(tx, channelName('trip_draft', tripId), DRAFT_RT.done, hint);
}

export function publishDraft(
  tx: pg.PoolClient,
  tripId: string,
  type: string,
  data: unknown,
): Promise<unknown> {
  return outbox(tx, channelName('trip_draft', tripId), type, data);
}

/** The crew-wide counter: redrafts used on the trip and its visible limit (null = unlimited). */
export async function publishRedraftCounter(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ used: number; redraft_limit: number | null }>(
    `SELECT coalesce((SELECT count FROM usage_counters
                       WHERE subject_kind = 'trip' AND subject_id = $1 AND metric = 'redrafts'
                         AND period_key = 'lifetime'), 0)::int AS used,
            (SELECT redraft_limit FROM trip_entitlements WHERE trip_id = $1) AS redraft_limit`,
    [tripId],
  );
  const row = rows[0];
  const limit = fromStoredRedraftLimit(row?.redraft_limit ?? 3);
  const hint: RedraftCounterHint = {
    used: row?.used ?? 0,
    limit: limit === Infinity ? null : limit,
  };
  await outbox(tx, channelName('trip', tripId), REDRAFT_COUNTER_RT, hint);
}
