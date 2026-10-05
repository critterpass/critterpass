/**
 * The change set lifecycle's shared steps (docs/data-model-sync-and-privacy.md §3.6): load and lock
 * a change set, move it along its state machine, read its approval tally, and apply an approved one
 * to the group plan through the same version commit as a direct edit. A change set whose base moved
 * on is rebased when nothing it touches changed in between, and marked stale otherwise; a stale set
 * never applies. Writes run as `app_system` after the command's own checks.
 */
import { appendDomainEvent, loadPollState, outbox, type PollState } from '@cp/db';
import {
  changeSetOpsSchema,
  changeSetOpsToEdits,
  channelName,
  DomainError,
  PLAN_RT,
  type ChangeSetOp,
  type ChangesetOutcome,
} from '@cp/domain';
import { changedSince, conflictsWith } from '@cp/planner';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { closeForEveryone } from '../commands/polls/shared';
import { yesNeeded } from './decider-policy';
import {
  commitPlanVersion,
  loadPlanState,
  lockTripPlan,
  replay,
  type TripPlanHead,
} from './versioning';

export interface ChangeSetRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly base_version_id: string;
  readonly author_id: string;
  readonly author_kind: 'user' | 'guide';
  readonly status: string;
  readonly scope: 'group' | 'personal';
  readonly poll_id: string | null;
  readonly ops: ChangeSetOp[];
  readonly result_version_id: string | null;
}

export const OPEN_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'proposed',
  'voting',
  'approved',
]);

/** The change set as the caller sees it (RLS), or `NOT_FOUND`. */
export async function requireVisibleChangeSet(tx: pg.PoolClient, id: string): Promise<void> {
  const { rowCount } = await tx.query('SELECT 1 FROM change_sets WHERE id = $1', [id]);
  if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'change_set' });
}

/** Re-reads the change set under its row lock, as the system. */
export async function lockChangeSet(tx: pg.PoolClient, id: string): Promise<ChangeSetRow> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<ChangeSetRow>(
      `SELECT cs.id, cs.trip_id, t.crew_id, cs.base_version_id, cs.author_id, cs.author_kind,
              cs.status, cs.scope, cs.poll_id, cs.ops, cs.result_version_id
         FROM change_sets cs JOIN trips t ON t.id = cs.trip_id
        WHERE cs.id = $1 FOR UPDATE OF cs`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'change_set' });
    return { ...row, ops: changeSetOpsSchema.parse(row.ops) };
  });
}

/** Walks the change set to `status` through each legal step (the guard allows no shortcuts). */
export async function advance(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  path: readonly string[],
  approvedBy?: { readonly kind: 'vote' | 'organiser' | 'self'; readonly uid: string | null },
): Promise<ChangeSetRow> {
  let status = row.status;
  await asSystemRole(tx, async () => {
    for (const next of path) {
      if (next === status) continue;
      await tx.query(
        next === 'approved'
          ? 'UPDATE change_sets SET status = $2, approved_by_kind = $3, approved_by = $4 WHERE id = $1'
          : 'UPDATE change_sets SET status = $2 WHERE id = $1',
        next === 'approved'
          ? [row.id, next, approvedBy?.kind ?? 'organiser', approvedBy?.uid ?? null]
          : [row.id, next],
      );
      status = next;
    }
  });
  return { ...row, status };
}

export function publishPlan(tx: pg.PoolClient, tripId: string, type: string, data: unknown) {
  return outbox(tx, channelName('trip_plan', tripId), type, data);
}

export interface Tally {
  readonly yes: readonly string[];
  readonly no: readonly string[];
  readonly approveOptionId: string | null;
  readonly rejectOptionId: string | null;
}

export function tallyOfPoll(state: PollState): Tally {
  const ordered = [...state.options].sort((a, b) => a.position - b.position);
  const approve = ordered[0]?.id ?? null;
  const reject = ordered[1]?.id ?? null;
  return {
    yes: state.ballots.filter((b) => b.option_id === approve).map((b) => b.user_id),
    no: state.ballots.filter((b) => b.option_id === reject).map((b) => b.user_id),
    approveOptionId: approve,
    rejectOptionId: reject,
  };
}

export async function outcomeOf(tx: pg.PoolClient, id: string): Promise<ChangesetOutcome> {
  return asSystemRole(tx, async () => {
    const { rows } = await tx.query<{
      status: string;
      poll_id: string | null;
      result_version_id: string | null;
    }>('SELECT status, poll_id, result_version_id FROM change_sets WHERE id = $1', [id]);
    const row = rows[0];
    if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'change_set' });
    const state = row.poll_id === null ? undefined : await loadPollState(tx, row.poll_id);
    const tally = state === undefined ? undefined : tallyOfPoll(state);
    const eligible = state?.poll.eligible_voter_ids.length ?? 0;
    return {
      change_set_id: id,
      status: row.status,
      poll_id: row.poll_id,
      yes: tally?.yes.length ?? 0,
      no: tally?.no.length ?? 0,
      needed:
        state?.poll.decider_policy === null || state === undefined
          ? 0
          : yesNeeded(state.poll.decider_policy, eligible, state.poll.threshold),
      eligible,
      closes_at: state?.poll.closes_at?.toISOString() ?? null,
      result_version_id: row.result_version_id,
    };
  });
}

/**
 * Checks the change set against the trip's current version: unchanged base, or a base whose moves
 * since do not touch anything the set touches (rebased onto the current version). Anything else
 * marks it stale (closing its vote) and answers `null`.
 */
export async function currentBaseFor(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  head: TripPlanHead,
): Promise<string | null> {
  const current = head.currentVersionId;
  if (current === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
  if (current === row.base_version_id) return current;
  const edits = changeSetOpsToEdits(row.ops);
  const [base, latest] = [
    await loadPlanState(tx, row.base_version_id),
    await loadPlanState(tx, current),
  ];
  const clean = conflictsWith(edits, changedSince(base, latest)).length === 0;
  let replays = clean;
  if (clean) {
    try {
      replay(latest, edits);
    } catch {
      replays = false;
    }
  }
  if (replays) {
    await asSystemRole(tx, () =>
      tx.query('UPDATE change_sets SET base_version_id = $2 WHERE id = $1', [row.id, current]),
    );
    await publishPlan(tx, row.trip_id, PLAN_RT.changesetRebased, {
      change_set_id: row.id,
      base_version: current,
    });
    return current;
  }
  await markStale(tx, row);
  return null;
}

/** Closes the change set's approval vote (if still open) with `winner`: yes, no or neither. */
export async function closeVote(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  winner: 'approve' | 'reject',
  reason: 'decider' | 'manual' | 'deadline',
  actorId: string | null,
): Promise<void> {
  const pollId = row.poll_id;
  if (pollId === null) return;
  await asSystemRole(tx, async () => {
    const state = await loadPollState(tx, pollId, 'update');
    if (state === undefined || state.poll.status !== 'open') return;
    const tally = tallyOfPoll(state);
    await closeForEveryone(tx, state, {
      reason,
      now: new Date(),
      actorId,
      deciderWinner: winner === 'approve' ? tally.approveOptionId : tally.rejectOptionId,
    });
  });
}

export async function markStale(tx: pg.PoolClient, row: ChangeSetRow): Promise<void> {
  await asSystemRole(tx, () =>
    tx.query("UPDATE change_sets SET status = 'stale' WHERE id = $1", [row.id]),
  );
  await closeVote(tx, row, 'reject', 'manual', null);
  await appendDomainEvent(tx, {
    type: 'change_set.stale',
    aggregateKind: 'change_set',
    aggregateId: row.id,
    actorKind: 'system',
    actorId: null,
    payload: { trip_id: row.trip_id, change_set_id: row.id },
    crewId: row.crew_id,
    tripId: row.trip_id,
  });
  await publishPlan(tx, row.trip_id, PLAN_RT.changesetStale, { change_set_id: row.id });
}

export type ApplyResult =
  { readonly status: 'applied'; readonly versionId: string } | { readonly status: 'stale' };

/** Applies an approved change set to the group plan (the caller checked who may). */
export async function applyToGroup(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  actor: { readonly kind: 'user' | 'system'; readonly id: string | null },
): Promise<ApplyResult> {
  const head = await lockTripPlan(tx, row.trip_id);
  const base = await currentBaseFor(tx, row, head);
  if (base === null) return { status: 'stale' };
  const accepted = row.ops.filter((op) => op.accepted !== false);
  const next = replay(await loadPlanState(tx, base), changeSetOpsToEdits(accepted));
  const versionId = await commitPlanVersion(tx, {
    head,
    baseVersionId: base,
    next,
    actor,
    source: 'changeset',
    opCount: accepted.length,
    ops: null,
    changeSetId: row.id,
  });
  await asSystemRole(tx, () =>
    tx.query("UPDATE change_sets SET status = 'applied', result_version_id = $2 WHERE id = $1", [
      row.id,
      versionId,
    ]),
  );
  await appendDomainEvent(tx, {
    type: 'change_set.applied',
    aggregateKind: 'change_set',
    aggregateId: row.id,
    actorKind: actor.kind,
    actorId: actor.id,
    payload: { trip_id: row.trip_id, change_set_id: row.id, result_version_id: versionId },
    crewId: row.crew_id,
    tripId: row.trip_id,
  });
  await publishPlan(tx, row.trip_id, PLAN_RT.changesetApplied, {
    change_set_id: row.id,
    version: versionId,
  });
  return { status: 'applied', versionId };
}

export async function rejectChangeSet(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  actorId: string | null,
): Promise<void> {
  await asSystemRole(tx, () =>
    tx.query("UPDATE change_sets SET status = 'rejected' WHERE id = $1", [row.id]),
  );
  await appendDomainEvent(tx, {
    type: 'change_set.rejected',
    aggregateKind: 'change_set',
    aggregateId: row.id,
    actorKind: actorId === null ? 'system' : 'user',
    actorId,
    payload: { trip_id: row.trip_id, change_set_id: row.id },
    crewId: row.crew_id,
    tripId: row.trip_id,
  });
  await publishPlan(tx, row.trip_id, PLAN_RT.changesetRejected, { change_set_id: row.id });
}
