/**
 * `feedback.fix_shipped`: the issue a ticket was filed under closed as completed, so its reporter
 * is told once, by an inbox card. When the issue names the version the fix is in
 * (`fixed-in:1.2.0`), the card waits until one of the reporter's devices runs that version or a
 * later one: the job looks again every day for up to sixty days, then gives up quietly.
 */
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import {
  compareAppVersions,
  ensureInboxKinds,
  FEEDBACK_FIX_SHIPPED_QUEUE,
  feedbackFixShippedJobSchema,
  HELP_INBOX_KIND,
  HELP_INBOX_KINDS,
  type FeedbackFixShippedJob,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { registerInboxFanout } from '../inbox/fanout';

export const FIX_SHIPPED_RECHECK_SECONDS = 24 * 60 * 60;
export const FIX_SHIPPED_MAX_WAITS = 60;

export type FixShippedOutcome = 'told' | 'waiting' | 'gave_up' | 'skipped';

export async function tellFixShipped(
  tx: pg.PoolClient,
  job: FeedbackFixShippedJob,
): Promise<FixShippedOutcome> {
  const { rows } = await tx.query<{
    user_id: string;
    ticket_no: string;
    status: string;
    fixed_in_version: string | null;
    fix_notified_at: Date | null;
  }>(
    `SELECT user_id, ticket_no, status, fixed_in_version, fix_notified_at
       FROM feedback_tickets WHERE id = $1 FOR UPDATE`,
    [job.ticket_id],
  );
  const ticket = rows[0];
  // A reopened issue takes the ticket out of `closed`; its card waits for the next close.
  if (ticket === undefined || ticket.fix_notified_at !== null || ticket.status !== 'closed') {
    return 'skipped';
  }
  const fixedIn = ticket.fixed_in_version;
  if (fixedIn !== null) {
    const devices = await tx.query<{ app_version: string }>(
      'SELECT app_version FROM devices WHERE user_id = $1',
      [ticket.user_id],
    );
    const installed = devices.rows.some((d) => compareAppVersions(d.app_version, fixedIn) >= 0);
    if (!installed) {
      if (job.waited >= FIX_SHIPPED_MAX_WAITS) return 'gave_up';
      await sendInTx(
        tx,
        FEEDBACK_FIX_SHIPPED_QUEUE,
        { ticket_id: job.ticket_id, waited: job.waited + 1 },
        {
          startAfter: FIX_SHIPPED_RECHECK_SECONDS,
          singletonKey: `${job.ticket_id}:${job.waited + 1}`,
        },
      );
      return 'waiting';
    }
  }
  await tx.query('UPDATE feedback_tickets SET fix_notified_at = now() WHERE id = $1', [
    job.ticket_id,
  ]);
  await appendDomainEvent(tx, {
    type: 'feedback.fix_shipped',
    aggregateKind: 'feedback_ticket',
    aggregateId: job.ticket_id,
    actorKind: 'system',
    actorId: null,
    payload: {
      ticket_id: job.ticket_id,
      ticket_no: Number(ticket.ticket_no),
      user_id: ticket.user_id,
      fixed_in_version: fixedIn,
    },
  });
  return 'told';
}

export function feedbackFixShippedJob(): JobDefinition<FeedbackFixShippedJob> {
  return defineJob({
    queue: FEEDBACK_FIX_SHIPPED_QUEUE,
    schema: feedbackFixShippedJobSchema,
    singletonKey: (data: FeedbackFixShippedJob) => `${data.ticket_id}:${data.waited}`,
    handler: async (data, ctx) => ({
      outcome: await withSystem(ctx.pool, (tx) => tellFixShipped(tx, data)),
    }),
  });
}

/** The card goes to the reporter alone and carries the ticket number and the version. */
export function registerHelpFanouts(): void {
  ensureInboxKinds(HELP_INBOX_KINDS);
  registerInboxFanout({
    kind: HELP_INBOX_KIND.fixShipped,
    audience: (_tx, event) => {
      const uid = event.payload['user_id'];
      return Promise.resolve(typeof uid === 'string' ? [uid] : []);
    },
    build: (_tx, event) =>
      Promise.resolve({
        crewId: null,
        tripId: null,
        actorId: null,
        data: {
          ticket_no: event.payload['ticket_no'] ?? null,
          fixed_in_version: event.payload['fixed_in_version'] ?? null,
        },
        deepLink: null,
      }),
  });
}
