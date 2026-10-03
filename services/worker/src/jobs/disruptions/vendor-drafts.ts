/**
 * A disruption's messages to a driver, villa or restaurant through the ops desk threads
 * (docs/api-contracts.md §4.11). The guide only ever drafts: a draft is sent by a person at the
 * desk once a member said yes to its exact text (an `ops.approvals` row as that member), or, while
 * the desk's WhatsApp number is not live or nobody staffs the desk (`safety.ops_desk`), the member
 * sends it from their own WhatsApp and we never claim it was sent.
 */
import { createHash } from 'node:crypto';

import { appendDomainEvent } from '@cp/db';
import { DEFAULT_DESK_HOURS, deskDueAt, VENDOR_MESSAGE_SUBJECT, type DeskHours } from '@cp/domain';
import { isPartnerEnabled } from '@cp/suppliers';
import type pg from 'pg';

const WHATSAPP_BUSINESS = 'whatsapp_business';

export interface VendorDraftInput {
  readonly tripId: string;
  readonly crewId: string;
  /** The traveller the thread is kept for (the lead of the delayed members). */
  readonly requestedBy: string;
  readonly providerId: string;
  readonly vendorName: string;
  readonly body: string;
}

/**
 * Whether the desk sends approved drafts: only with its WhatsApp number live and a person staffing
 * it (`safety.ops_desk`, off unless switched on), the same rule the api's booking messages follow.
 */
async function deskSends(tx: pg.PoolClient): Promise<boolean> {
  const live = await isPartnerEnabled(
    (sql, params) => tx.query(sql, [...params]),
    WHATSAPP_BUSINESS,
  );
  if (!live) return false;
  const { rows } = await tx.query<{ on: boolean }>(
    "SELECT (value #>> '{}') = 'true' AS on FROM ops.ops_config WHERE key = 'safety.ops_desk'",
  );
  return rows[0]?.on === true;
}

export async function createVendorDraft(
  tx: pg.PoolClient,
  input: VendorDraftInput,
): Promise<{ messageId: string; threadId: string; channel: string }> {
  const channel = (await deskSends(tx)) ? 'whatsapp_business' : 'self_send';
  const open = await tx.query<{ id: string }>(
    `SELECT id FROM ops.vendor_threads
      WHERE trip_id = $1 AND requested_by = $2 AND provider_id = $3 AND status <> 'closed'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [input.tripId, input.requestedBy, input.providerId],
  );
  let threadId = open.rows[0]?.id;
  if (threadId === undefined) {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO ops.vendor_threads (trip_id, requested_by, provider_id, vendor_name, channel)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [input.tripId, input.requestedBy, input.providerId, input.vendorName, channel],
    );
    threadId = inserted.rows[0]?.id;
    if (threadId === undefined) throw new Error('thread insert returned no row');
  } else {
    await tx.query(
      `UPDATE ops.vendor_messages SET status = 'superseded', version = version + 1
        WHERE thread_id = $1 AND direction = 'outbound' AND status IN ('draft', 'approved')`,
      [threadId],
    );
  }
  const message = await tx.query<{ id: string }>(
    `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, proposed_by, intent, body, status)
     VALUES ($1, $2, 'outbound', 'guide', 'change', $3, 'draft') RETURNING id`,
    [threadId, input.tripId, input.body],
  );
  const messageId = message.rows[0]?.id as string;
  await appendDomainEvent(tx, {
    type: 'vendor_msg.drafted',
    aggregateKind: 'vendor_message',
    aggregateId: messageId,
    actorKind: 'guide',
    actorId: null,
    crewId: input.crewId,
    tripId: input.tripId,
    payload: { trip_id: input.tripId, thread_id: threadId, message_id: messageId, channel },
  });
  return { messageId, threadId, channel };
}

async function deskHours(tx: pg.PoolClient): Promise<DeskHours> {
  const { rows } = await tx.query<{ value: { open?: unknown; close?: unknown } | null }>(
    "SELECT value FROM ops.ops_config WHERE key = 'desk.hours'",
  );
  const value = rows[0]?.value;
  return typeof value?.open === 'string' && typeof value.close === 'string'
    ? { open: value.open, close: value.close, tz: DEFAULT_DESK_HOURS.tz }
    : DEFAULT_DESK_HOURS;
}

export type VendorApproval = 'approved' | 'self_send' | 'gone';

/**
 * A member's yes to the draft as shown: recorded as their approval of the exact text and handed to
 * the desk as a task due within its send window. A self-send draft stays with the member.
 */
export async function approveVendorDraft(
  tx: pg.PoolClient,
  messageId: string,
  approverId: string,
  now: Date,
): Promise<VendorApproval> {
  const { rows } = await tx.query<{
    id: string;
    thread_id: string;
    trip_id: string;
    crew_id: string;
    body: string;
    status: string;
    channel: string;
    task_id: string | null;
  }>(
    `SELECT m.id, m.thread_id, m.trip_id, tr.crew_id, m.body, m.status, t.channel, t.task_id
       FROM ops.vendor_messages m JOIN ops.vendor_threads t ON t.id = m.thread_id
       JOIN trips tr ON tr.id = m.trip_id
      WHERE m.id = $1 FOR UPDATE OF m`,
    [messageId],
  );
  const message = rows[0];
  if (message === undefined || message.status !== 'draft') return 'gone';
  if (message.channel === 'self_send') return 'self_send';
  const approval = await tx.query<{ id: string }>(
    `INSERT INTO ops.approvals (user_id, subject_kind, subject_id, text_shown, op_id)
     VALUES ($1, $2, $3, $4, gen_random_uuid()) RETURNING id`,
    [approverId, VENDOR_MESSAGE_SUBJECT, message.id, message.body],
  );
  const approvalId = approval.rows[0]?.id as string;
  await tx.query(
    `UPDATE ops.vendor_messages
        SET status = 'approved', approved_by_user_id = $2, approved_at = $3, approval_id = $4,
            approved_text_sha256 = $5, version = version + 1
      WHERE id = $1`,
    [
      message.id,
      approverId,
      now,
      approvalId,
      createHash('sha256').update(message.body, 'utf8').digest('hex'),
    ],
  );
  const due = deskDueAt(now, await deskHours(tx));
  let taskId = message.task_id;
  if (taskId === null) {
    const task = await tx.query<{ id: string }>(
      `INSERT INTO ops.concierge_tasks (kind, trip_id, requested_by, approval_id, due_at, notes)
       VALUES ('vendor_message', $1, $2, $3, $4, jsonb_build_array(jsonb_build_object(
         'at', $5::text, 'admin_id', NULL, 'text', 'A member approved the guide''s draft',
         'system', true)))
       RETURNING id`,
      [message.trip_id, approverId, approvalId, due, now.toISOString()],
    );
    taskId = task.rows[0]?.id as string;
    await tx.query('UPDATE ops.vendor_threads SET task_id = $2 WHERE id = $1', [
      message.thread_id,
      taskId,
    ]);
  } else {
    await tx.query(
      `UPDATE ops.concierge_tasks SET approval_id = $2, due_at = $3, version = version + 1,
         status = CASE WHEN status IN ('done', 'cancelled') THEN 'new' ELSE status END
       WHERE id = $1`,
      [taskId, approvalId, due],
    );
  }
  await appendDomainEvent(tx, {
    type: 'vendor_msg.approved',
    aggregateKind: 'vendor_message',
    aggregateId: message.id,
    actorKind: 'user',
    actorId: approverId,
    crewId: message.crew_id,
    tripId: message.trip_id,
    payload: {
      trip_id: message.trip_id,
      thread_id: message.thread_id,
      message_id: message.id,
      task_id: taskId,
    },
  });
  return 'approved';
}

/** Withdraws a draft nobody approved (the row is no longer needed). */
export async function withdrawVendorDraft(tx: pg.PoolClient, messageId: string): Promise<void> {
  await tx.query(
    `UPDATE ops.vendor_messages SET status = 'superseded', version = version + 1
      WHERE id = $1 AND status = 'draft'`,
    [messageId],
  );
}
