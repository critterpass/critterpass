/**
 * A disruption's vendor rows follow the desk thread truthfully:
 * - `vendor_msg.approved` / `sent` / `failed` move the row (the desk sent it, not us);
 * - a sent row the vendor has not answered in 30 minutes becomes `no_answer` ("No answer from Made
 *   — call?");
 * - `vendor_msg.reply_parsed` with a yes → `confirmed` ("Made confirmed 13:50"), and only then the
 *   retime waiting on it runs, through the executor (the crew's yes to the message is its
 *   approval); a no → `declined`, the retime is withdrawn; anything else stays with the reply shown.
 * - "Undo everything" on a message already sent drafts its compensation, which again needs a yes.
 */
import { sendInTx, withSystem } from '@cp/db';
import {
  DISRUPTION_QUEUES,
  noAnswerJobSchema,
  VENDOR_NO_ANSWER_MIN,
  type DisruptionAction,
  type NoAnswerJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { advancePlan, startRows } from './execute-rows';
import type { ReactEvent } from './react';
import { compensationRow } from './retrigger';
import { disruptionsWhere, lockDisruption, moveRow, saveActions, type DisruptionRow } from './rows';

const str = (event: ReactEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

/** Made said yes: the retime waiting on it is approved by the same crew yes, and runs. */
async function runWaitingRetime(
  tx: pg.PoolClient,
  disruption: DisruptionRow,
  vendorRow: DisruptionAction,
): Promise<void> {
  await moveRow(
    tx,
    disruption,
    (row) => row.depends_on === vendorRow.id && row.state === 'waiting_vendor',
    'approved',
    { poll: vendorRow.poll, decided_by: vendorRow.decided_by },
  );
  await advancePlan(tx, disruption);
}

export async function reactToVendorMessage(
  tx: pg.PoolClient,
  event: ReactEvent,
  now: Date,
): Promise<number> {
  const messageId = str(event, 'message_id');
  const threadId = str(event, 'thread_id');
  if (messageId === null || threadId === null) return 0;
  // A reply is its own inbound message: the row points at the outbound one in the same thread.
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM ops.vendor_messages WHERE thread_id = $1 AND direction = 'outbound'`,
    [threadId],
  );
  let moved = 0;
  for (const outbound of rows) {
    for (const disruption of await disruptionsWhere(tx, 'vendor_message_id', outbound.id)) {
      const row = disruption.actions.find((action) => action.vendor_message_id === outbound.id);
      if (row === undefined) continue;
      const match = (action: DisruptionAction) => action.id === row.id;
      if (event.type === 'vendor_msg.approved') {
        moved += (await moveRow(tx, disruption, match, 'approved')).length;
      } else if (event.type === 'vendor_msg.sent') {
        moved += (await moveRow(tx, disruption, match, 'sent')).length;
        await sendInTx(
          tx,
          DISRUPTION_QUEUES.noAnswer,
          { disruption_id: disruption.id, action_id: row.id },
          {
            singletonKey: `${disruption.id}:${row.id}`,
            startAfter: new Date(now.getTime() + VENDOR_NO_ANSWER_MIN * 60_000),
          },
        );
      } else if (event.type === 'vendor_msg.failed') {
        moved += (await moveRow(tx, disruption, match, 'failed')).length;
      } else if (event.type === 'vendor_msg.reply_parsed') {
        const intent = str(event, 'intent');
        if (intent === 'yes') {
          const vendor = String(row.facts['vendor'] ?? '');
          const to = row.facts['to'];
          moved += (
            await moveRow(tx, disruption, match, 'confirmed', {
              facts: { ...row.facts, vendor_status: 'confirmed' },
              label: to === undefined ? `${vendor} confirmed` : `${vendor} confirmed ${String(to)}`,
            })
          ).length;
          await runWaitingRetime(tx, disruption, row);
        } else if (intent === 'no') {
          moved += (await moveRow(tx, disruption, match, 'declined')).length;
          await moveRow(tx, disruption, (action) => action.depends_on === row.id, 'withdrawn');
        }
      }
    }
  }
  return moved;
}

/** "Undo everything" on messages the vendor already has: a compensation draft each, needing a yes. */
export async function reactToUndo(
  tx: pg.PoolClient,
  event: ReactEvent,
  now: Date,
): Promise<number> {
  const disruptionId = str(event, 'disruption_id');
  if (disruptionId === null) return 0;
  const disruption = await lockDisruption(tx, disruptionId);
  if (disruption === undefined) return 0;
  const target = str(event, 'action_id') ?? 'all';
  const sent = disruption.actions.filter(
    (row) =>
      (target === 'all' || row.id === target) &&
      row.class === 'vendor' &&
      ['sent', 'confirmed', 'no_answer'].includes(row.state) &&
      !disruption.actions.some((other) => other.id === `compensate:${row.id}`),
  );
  const drafts = sent.map((row) =>
    compensationRow(
      row,
      `Tell ${String(row.facts['vendor'])}: back to ${String(row.facts['from'])}?`,
    ),
  );
  if (drafts.length === 0) return 0;
  const started = await startRows(tx, drafts, {
    disruptionId,
    tripId: disruption.trip_id,
    crewId: disruption.crew_id,

    travellerIds: disruption.affected.traveller_ids ?? [],
    unaffectedIds: [],
    headline: disruption.title,
    now,
  });
  await saveActions(tx, disruption, [...disruption.actions, ...started], started);
  return started.length;
}

export async function markNoAnswer(pool: pg.Pool, job: NoAnswerJob): Promise<number> {
  return withSystem(pool, async (tx) => {
    const disruption = await lockDisruption(tx, job.disruption_id);
    if (disruption === undefined) return 0;
    return (
      await moveRow(
        tx,
        disruption,
        (row) => row.id === job.action_id && row.state === 'sent',
        'no_answer',
        {
          label: `No answer from ${String(disruption.actions.find((r) => r.id === job.action_id)?.facts['vendor'] ?? 'them')} — call?`,
        },
      )
    ).length;
  });
}

export function noAnswerJob(): JobDefinition<NoAnswerJob> {
  return defineJob({
    queue: DISRUPTION_QUEUES.noAnswer,
    schema: noAnswerJobSchema,
    singletonKey: (data: NoAnswerJob) => `${data.disruption_id}:${data.action_id}`,
    handler: async (data, ctx) => ({ moved: await markNoAnswer(ctx.pool, data) }),
  });
}
