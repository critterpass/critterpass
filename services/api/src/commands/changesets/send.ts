/**
 * `send_changeset` (docs/api-contracts.md §4.6): the author sends the accepted changes to the crew.
 * The decider policy defaults by who the change touches (./../../plan/decider-policy.ts); a change
 * that touches only the author applies at once. Otherwise an approval poll opens for the affected
 * members, closing by the policy window and never after the earliest supplier hold, its deadline
 * timer is armed, and the change set's card lands in crew chat. Sending is the author's yes: when
 * the change touches them too, their ballot is cast with it, and a vote that yes already decides
 * closes at once.
 */
import { appendDomainEvent, outbox, scheduleEvent } from '@cp/db';
import {
  changeSetOpsToEdits,
  channelName,
  DomainError,
  generateUuidV7,
  getHoldExpiryProvider,
  PLAN_QUEUES,
  PLAN_RT,
  sendChangesetPayloadSchema,
  type ChangesetOutcome,
  type PlanState,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import {
  advance,
  applyToGroup,
  currentBaseFor,
  lockChangeSet,
  outcomeOf,
  publishPlan,
  requireVisibleChangeSet,
  type ChangeSetRow,
} from '../../plan/changeset-store';
import { requirePlanProposer, tripOrganiserIds, tripVoters } from '../../plan/access';
import { castFirstBallot, settleVote } from '../../plan/changeset-vote';
import { chooseDeciderPolicy } from '../../plan/decider-policy';
import { loadPlanState, lockTripPlan, replay } from '../../plan/versioning';
import { queryIn } from '../../plan/providers';
import { defineCommand } from '../_framework/define-command';

/** Everyone the accepted ops touch: their own list, plus who attends the item before and after. */
function affectedBy(row: ChangeSetRow, state: PlanState, everyone: readonly string[]): string[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const affected = new Set<string>();
  const attend = (ids: readonly string[] | undefined) =>
    (ids === undefined || ids.length === 0 ? everyone : ids).forEach((uid) => affected.add(uid));
  for (const op of row.ops.filter((o) => o.accepted !== false)) {
    op.affected_user_ids.forEach((uid) => affected.add(uid));
    if (op.op !== 'add') attend(byId.get(op.target)?.attendee_ids);
    if (op.op === 'add' || op.after?.attendee_ids !== undefined) attend(op.after?.attendee_ids);
  }
  const members = new Set(everyone);
  return [...affected].filter((uid) => members.has(uid)).sort();
}

export async function openPoll(
  tx: pg.PoolClient,
  row: ChangeSetRow,
  input: {
    readonly uid: string;
    readonly eligible: readonly string[];
    readonly policy: string;
    readonly threshold: number | null;
    readonly closesAt: Date;
  },
): Promise<string> {
  const pollId = generateUuidV7();
  await asSystemRole(tx, async () => {
    await tx.query(
      `INSERT INTO polls (id, crew_id, trip_id, kind, created_by, eligible_voter_ids, decider_policy,
         threshold, closes_at, allow_change)
       VALUES ($1, $2, $3, 'changeset_approval', $4, $5::uuid[], $6, $7, $8, true)`,
      [
        pollId,
        row.crew_id,
        row.trip_id,
        input.uid,
        input.eligible,
        input.policy,
        input.threshold,
        input.closesAt,
      ],
    );
    await tx.query(
      `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, proposed_by, position)
       VALUES ($1, $2, 'changeset', $3, 'yes', $4, 0), ($1, $2, 'text', NULL, 'no', $4, 1)`,
      [pollId, row.crew_id, row.id, input.uid],
    );
    await scheduleEvent(tx, {
      kind: PLAN_QUEUES.changesetExpiry,
      refId: row.id,
      tz: 'UTC',
      at: input.closesAt,
    });
    const messageId = generateUuidV7();
    const { rows } = await tx.query<{ seq: string }>(
      `INSERT INTO messages (id, crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
       VALUES ($1, $2, $3, 'user', $4, 'changeset', '', 'change_set', $5) RETURNING seq`,
      [messageId, row.crew_id, row.trip_id, input.uid, row.id],
    );
    await outbox(tx, channelName('crew_chat', row.crew_id), 'message.created', {
      crew_id: row.crew_id,
      message_id: messageId,
      seq: Number(rows[0]?.seq),
    });
  });
  return pollId;
}

export const sendChangesetCommand = defineCommand({
  name: 'send_changeset',
  v: 1,
  schema: sendChangesetPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireVisibleChangeSet(tx, payload.changeset_id);
    const row = await lockChangeSet(tx, payload.changeset_id);
    if (row.author_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'author_only' });
  },
  handle: async (tx, payload, ctx): Promise<ChangesetOutcome> => {
    const now = ctx.clock.serverNow;
    let row = await lockChangeSet(tx, payload.changeset_id);
    if (row.status === 'voting' || row.status === 'applied') return outcomeOf(tx, row.id);
    if (row.status !== 'draft' && row.status !== 'proposed') {
      throw new DomainError('STATE_INVALID', { state: row.status });
    }
    await requirePlanProposer(tx, row.trip_id);
    const accepted = row.ops.filter((op) => op.accepted !== false);
    if (accepted.length === 0)
      throw new DomainError('STATE_INVALID', { reason: 'nothing_accepted' });
    const head = await lockTripPlan(tx, row.trip_id);
    const base = await currentBaseFor(tx, row, head);
    if (base === null) return outcomeOf(tx, row.id);
    row = { ...row, base_version_id: base };
    const state = await loadPlanState(tx, base);
    replay(state, changeSetOpsToEdits(accepted));
    const voters = await tripVoters(tx, row.trip_id, row.crew_id);
    const affected = affectedBy(row, state, voters);
    const touched = state.items.filter((item) =>
      accepted.some((op) => op.target === item.stable_id),
    );
    const { rows: trip } = await tx.query<{ status: string }>(
      'SELECT status FROM trips WHERE id = $1',
      [row.trip_id],
    );
    const holdExpiry = await getHoldExpiryProvider().earliestHoldExpiry({
      tripId: row.trip_id,
      stableIds: accepted.map((op) => op.target),
      bookingIds: touched.flatMap((item) => (item.booking_id ? [item.booking_id] : [])),
      query: queryIn(tx),
    });
    const choice = chooseDeciderPolicy({
      authorId: ctx.uid,
      ops: accepted,
      affectedUserIds: affected,
      costDeltaMinor: 0,
      inTrip: trip[0]?.status === 'in_trip',
      now,
      itemStarts: touched.flatMap((item) => (item.starts_at ? [new Date(item.starts_at)] : [])),
      holdExpiry,
      requested: {
        ...(payload.policy === undefined ? {} : { policy: payload.policy }),
        ...(payload.threshold === undefined ? {} : { threshold: payload.threshold }),
      },
    });
    row = await advance(tx, row, ['proposed']);
    if (choice.policy === 'self') {
      row = await advance(tx, row, ['approved'], { kind: 'self', uid: ctx.uid });
      await applyToGroup(tx, row, { kind: 'user', id: ctx.uid });
      return outcomeOf(tx, row.id);
    }
    const eligible = choice.affectedUserIds.length > 0 ? choice.affectedUserIds : voters;
    const pollId = await openPoll(tx, row, {
      uid: ctx.uid,
      eligible,
      policy: choice.policy,
      threshold: choice.threshold,
      closesAt: choice.closesAt,
    });
    await asSystemRole(tx, () =>
      tx.query("UPDATE change_sets SET status = 'voting', poll_id = $2 WHERE id = $1", [
        row.id,
        pollId,
      ]),
    );
    row = { ...row, status: 'voting', poll_id: pollId };
    let decided = false;
    if (eligible.includes(ctx.uid)) {
      const { rows: yes } = await asSystemRole(tx, () =>
        tx.query<{ id: string }>(
          'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY position LIMIT 1',
          [pollId],
        ),
      );
      await castFirstBallot(tx, row, {
        pollId,
        optionId: yes[0]?.id ?? null,
        uid: ctx.uid,
        via: ctx.via,
        opId: ctx.opId,
        now,
      });
      const result = await settleVote(tx, row, {
        pollId,
        rules: {
          policy: choice.policy,
          threshold: choice.threshold,
          eligible,
          organiserIds: await tripOrganiserIds(tx, row.trip_id),
        },
        uid: ctx.uid,
      });
      decided = result === 'approve' || result === 'reject';
    }
    // Nobody is asked for a yes on a vote the author's own already decided.
    if (!decided) {
      await appendDomainEvent(tx, {
        type: 'change_set.proposed',
        aggregateKind: 'change_set',
        aggregateId: row.id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { trip_id: row.trip_id, change_set_id: row.id },
        crewId: row.crew_id,
        tripId: row.trip_id,
      });
    }
    const outcome = await outcomeOf(tx, row.id);
    await publishPlan(tx, row.trip_id, PLAN_RT.changesetSent, {
      change_set_id: row.id,
      poll_id: pollId,
      policy: choice.policy,
      yes: outcome.yes,
      needed: outcome.needed,
      eligible: outcome.eligible,
      closes_at: choice.closesAt.toISOString(),
    });
    return outcome;
  },
});
