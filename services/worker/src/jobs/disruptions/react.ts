/**
 * `disruption.react`: a disruption row moves only on a real outcome, whichever process appended it
 * (the hooks in ./hooks.ts and the api's twin queue one job per event id):
 * - `change_set.applied` of a row's guide action → `done` (the tick on 3k-5);
 * - `guide_action.undone` → `undone`;
 * - `poll.closed` on a row's decision poll → approved (a plan row's change set is approved by the
 *   vote and applied through the executor; a vendor draft is approved as the member whose ballot
 *   decided it and handed to the desk) or kept;
 * - vendor messages sent, failed or answered, and "undo everything" → ./apply-vendor-reply.ts;
 * - `running_late.detected` → the options (./late-options.ts); `late_option.chosen` → its rows.
 */
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import {
  DISRUPTION_QUEUES,
  disruptionReactJobSchema,
  type DisruptionAction,
  type DisruptionReactJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { applyApprovedGuideAction, executeGuideAction } from '../../guide-actions';
import { reactToUndo, reactToVendorMessage } from './apply-vendor-reply';
import { workLateOptions, type LateWriter } from './late-options';
import { applyLateChoice } from './running-late';
import { seatsNotConfirmed } from './storm-supplier';
import { advancePlan } from './execute-rows';
import { settleSuggestions } from './weather-replan';
import { disruptionsWhere, moveRow, type DisruptionRow } from './rows';
import { approveVendorDraft, withdrawVendorDraft } from './vendor-drafts';

export interface ReactEvent {
  readonly id: string;
  readonly type: DisruptionReactJob['event_type'];
  readonly actorId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

const str = (event: ReactEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

async function onApplied(tx: pg.PoolClient, event: ReactEvent): Promise<number> {
  const changeSet = str(event, 'change_set_id');
  if (changeSet === null) return 0;
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM guide_actions WHERE change_set_id = $1 AND disruption_id IS NOT NULL',
    [changeSet],
  );
  let moved = 0;
  for (const action of rows) {
    for (const disruption of await disruptionsWhere(tx, 'guide_action_id', action.id)) {
      const changed = await moveRow(
        tx,
        disruption,
        (row) => row.guide_action_id === action.id && row.state !== 'undone',
        'done',
      );
      moved += changed.length;
      await advancePlan(tx, disruption);
    }
  }
  return moved;
}

/**
 * A retime that ran only after its vendor confirmed may still need the crew's yes by policy: that
 * yes is the decision poll the crew approved the message on, so the change set is approved by it.
 */
async function onProposed(tx: pg.PoolClient, event: ReactEvent): Promise<number> {
  const changeSet = str(event, 'change_set_id');
  if (changeSet === null) return 0;
  const { rows } = await tx.query<{ id: string }>(
    'SELECT id FROM guide_actions WHERE change_set_id = $1 AND disruption_id IS NOT NULL',
    [changeSet],
  );
  let applied = 0;
  for (const action of rows) {
    for (const disruption of await disruptionsWhere(tx, 'guide_action_id', action.id)) {
      const row = disruption.actions.find(
        (r) => r.guide_action_id === action.id && r.state === 'running',
      );
      if (row === undefined) continue;
      if (row.poll === null) {
        // A late member's own pick was the yes (./running-late.ts): approved as that member.
        if (row.decided_by === null) continue;
        await applyApproved(tx, row, { by: row.decided_by });
        applied += 1;
        continue;
      }
      const poll = await tx.query<{ winner_option_id: string | null }>(
        "SELECT winner_option_id FROM polls WHERE id = $1 AND status = 'closed'",
        [row.poll.id],
      );
      if (poll.rows[0]?.winner_option_id !== row.poll.approve_option_id) continue;
      await applyApproved(tx, row, { pollId: row.poll.id });
      applied += 1;
    }
  }
  return applied;
}

async function onUndone(tx: pg.PoolClient, event: ReactEvent): Promise<number> {
  const actionId = str(event, 'action_id');
  if (actionId === null) return 0;
  let moved = 0;
  for (const disruption of await disruptionsWhere(tx, 'guide_action_id', actionId)) {
    moved += (await moveRow(tx, disruption, (row) => row.guide_action_id === actionId, 'undone'))
      .length;
  }
  return moved;
}

/**
 * Approves a plan row's change set, by the poll's vote or as the member whose own pick was the
 * yes, and runs it through the executor.
 */
async function applyApproved(
  tx: pg.PoolClient,
  row: DisruptionAction,
  yes: { readonly pollId: string } | { readonly by: string },
): Promise<void> {
  if (row.guide_action_id === null) return;
  const { rows } = await tx.query<{ change_set_id: string; status: string }>(
    'SELECT change_set_id, status FROM guide_actions WHERE id = $1 FOR UPDATE',
    [row.guide_action_id],
  );
  const action = rows[0];
  if (action === undefined) return;
  // The crew may answer before the executor has decided the action: decide it now (a planned
  // action touching others always waits for a yes), then apply it by the vote.
  if (action.status === 'planned') {
    const outcome = await executeGuideAction(tx, row.guide_action_id);
    if (outcome.status !== 'needs_approval') return;
  } else if (action.status !== 'needs_approval') {
    return;
  }
  await tx.query(
    `UPDATE change_sets SET status = 'approved', approved_by_kind = $2, poll_id = $3, approved_by = $4
      WHERE id = $1 AND status IN ('proposed', 'voting')`,
    'pollId' in yes
      ? [action.change_set_id, 'vote', yes.pollId, null]
      : [action.change_set_id, 'self', null, yes.by],
  );
  await applyApprovedGuideAction(tx, row.guide_action_id);
}

async function decide(
  tx: pg.PoolClient,
  disruption: DisruptionRow,
  row: DisruptionAction,
  approved: boolean,
  actorId: string | null,
  now: Date,
): Promise<void> {
  const pollId = row.poll?.id ?? '';
  if (approved && row.class === 'plan') {
    await moveRow(tx, disruption, (r) => r.id === row.id, 'approved', { decided_by: actorId });
    await advancePlan(tx, disruption);
  } else if (approved && row.class === 'vendor' && row.vendor_message_id !== null && actorId) {
    await approveVendorDraft(tx, row.vendor_message_id, actorId, now);
    await moveRow(tx, disruption, (r) => r.id === row.id, 'approved', { decided_by: actorId });
  } else {
    if (row.vendor_message_id !== null) await withdrawVendorDraft(tx, row.vendor_message_id);
    if (row.guide_action_id !== null) {
      await tx.query(
        `UPDATE change_sets SET status = 'rejected'
          WHERE id = (SELECT change_set_id FROM guide_actions WHERE id = $1)
            AND status IN ('proposed', 'voting')`,
        [row.guide_action_id],
      );
    }
    await moveRow(tx, disruption, (r) => r.id === row.id, 'kept', { decided_by: actorId });
    await moveRow(tx, disruption, (r) => r.depends_on === row.id, 'withdrawn');
  }
  await appendDomainEvent(tx, {
    type: 'disruption.action_decided',
    aggregateKind: 'trip',
    aggregateId: disruption.trip_id,
    actorKind: actorId === null ? 'system' : 'user',
    actorId,
    crewId: disruption.crew_id,
    tripId: disruption.trip_id,
    payload: {
      trip_id: disruption.trip_id,
      disruption_id: disruption.id,
      action_id: pollId,
      decision: approved ? 'approve' : 'keep',
    },
  });
}

async function onPollClosed(tx: pg.PoolClient, event: ReactEvent, now: Date): Promise<number> {
  const pollId = str(event, 'poll_id');
  if (pollId === null) return 0;
  const winner = str(event, 'winner_option_id');
  if (await decideStorm(tx, pollId, winner)) return 1;
  let decided = 0;
  for (const disruption of await disruptionsWhere(tx, 'poll', pollId)) {
    const row = disruption.actions.find((action) => action.poll?.id === pollId);
    if (row === undefined || !['needs_yes', 'draft_ready'].includes(row.state)) continue;
    const approved = winner !== null && winner === row.poll?.approve_option_id;
    await decide(tx, disruption, row, approved, event.actorId, now);
    decided += 1;
  }
  return decided;
}

/** A storm vote closed: record the crew's choice (none → keep) and commit it. */
async function decideStorm(
  tx: pg.PoolClient,
  pollId: string,
  winner: string | null,
): Promise<boolean> {
  const { rows } = await tx.query<{
    id: string;
    options: { id: string; poll_option_id: string }[];
  }>(
    `SELECT id, options FROM disruptions
      WHERE decision_poll_id = $1 AND kind = 'storm' AND status = 'open' FOR UPDATE`,
    [pollId],
  );
  const storm = rows[0];
  if (storm === undefined) return false;
  const chosen = storm.options.find((option) => option.poll_option_id === winner)?.id ?? 'keep';
  await tx.query('UPDATE disruptions SET chosen_option_id = $2 WHERE id = $1', [storm.id, chosen]);
  await sendInTx(
    tx,
    DISRUPTION_QUEUES.stormCommit,
    { disruption_id: storm.id },
    {
      singletonKey: storm.id,
    },
  );
  return true;
}

export async function reactToEvent(
  pool: pg.Pool,
  job: DisruptionReactJob,
  now: Date = new Date(),
  lateWriter?: LateWriter,
): Promise<number> {
  if (job.event_type === 'running_late.detected') {
    // The guide words the options between two transactions, so this one runs outside the rest.
    const disruptionId = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string | null }>(
        "SELECT payload ->> 'disruption_id' AS id FROM app.domain_event_for_routing($1)",
        [job.event_id],
      );
      return rows[0]?.id ?? null;
    });
    if (disruptionId === null || lateWriter === undefined) return 0;
    return workLateOptions(pool, disruptionId, lateWriter, now);
  }
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ actor_id: string | null; payload: Record<string, unknown> }>(
      'SELECT actor_id, payload FROM app.domain_event_for_routing($1)',
      [job.event_id],
    );
    const found = rows[0];
    if (found === undefined) return 0;
    const event: ReactEvent = {
      id: job.event_id,
      type: job.event_type,
      actorId: found.actor_id,
      payload: found.payload,
    };
    switch (event.type) {
      case 'change_set.proposed':
        return onProposed(tx, event);
      case 'change_set.applied':
        return (
          (await onApplied(tx, event)) +
          (await settleSuggestions(tx, str(event, 'trip_id') ?? '', str(event, 'change_set_id')))
        );
      case 'guide_action.undone':
        return onUndone(tx, event);
      case 'poll.closed':
        return onPollClosed(tx, event, now);
      case 'disruption.action_undone':
        return reactToUndo(tx, event, now);
      case 'late_option.chosen':
        return applyLateChoice(tx, event, now);
      case 'running_late.detected':
        return 0;
      case 'activity.hold_expired':
      case 'activity.hold_released':
      case 'activity.rejected':
        return seatsNotConfirmed(tx, event);
      case 'vendor_msg.approved':
      case 'vendor_msg.sent':
      case 'vendor_msg.failed':
      case 'vendor_msg.reply_parsed':
        return reactToVendorMessage(tx, event, now);
    }
  });
}

export function disruptionReactJob(lateWriter?: LateWriter): JobDefinition<DisruptionReactJob> {
  return defineJob({
    queue: DISRUPTION_QUEUES.react,
    schema: disruptionReactJobSchema,
    handler: async (data, ctx) => ({
      moved: await reactToEvent(ctx.pool, data, new Date(), lateWriter),
    }),
  });
}
