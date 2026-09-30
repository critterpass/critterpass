/**
 * Vendor desk reads, as `admin_reader`: threads by what the desk owes them, soonest due first, and
 * one thread with its messages verbatim (the approved text with its SHA-256 and the approval's op
 * id, replies exactly as received with their reading), the task's notes and whether the desk
 * number can send right now.
 */
import {
  deskSla,
  WHATSAPP_SERVICE_WINDOW_MS,
  type ConciergeTaskStatus,
  type DeskHours,
  type VendorDeskDetail,
  type VendorDeskThread,
  type VendorDeskView,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from '../reads';
import type { OperatorDirectory } from '../registry';

const VIEW_FILTER: Readonly<Record<VendorDeskView, string>> = {
  to_send: `EXISTS (SELECT 1 FROM ops.vendor_messages m
             WHERE m.thread_id = t.id AND m.direction = 'outbound' AND m.status = 'approved')`,
  awaiting_approval: `t.status <> 'closed' AND EXISTS (SELECT 1 FROM ops.vendor_messages m
             WHERE m.thread_id = t.id AND m.direction = 'outbound' AND m.status = 'draft')`,
  waiting_reply: `t.status = 'waiting_reply'`,
  replied: `t.status = 'replied'`,
  closed: `t.status = 'closed'`,
};

interface ThreadRow {
  id: string;
  trip_id: string;
  vendor_name: string;
  channel: VendorDeskThread['channel'];
  status: VendorDeskThread['status'];
  requester_name: string | null;
  task_id: string | null;
  task_status: ConciergeTaskStatus | null;
  due_at: Date | null;
  contact_set: boolean;
  last_inbound_at: Date | null;
  updated_at: Date;
}

const THREAD_SELECT = `SELECT t.id, t.trip_id, t.vendor_name, t.channel, t.status,
    coalesce(u.display_name, u.username) AS requester_name, t.task_id, c.status AS task_status,
    c.due_at, t.wa_contact_hash IS NOT NULL AS contact_set, t.last_inbound_at, t.updated_at
  FROM ops.vendor_threads t
  LEFT JOIN users u ON u.id = t.requested_by
  LEFT JOIN ops.concierge_tasks c ON c.id = t.task_id`;

function toThread(row: ThreadRow, now: Date): VendorDeskThread {
  return {
    thread_id: row.id,
    trip_id: row.trip_id,
    vendor_name: row.vendor_name,
    channel: row.channel,
    status: row.status,
    requester_name: row.requester_name,
    task_id: row.task_id,
    due_at: row.due_at?.toISOString() ?? null,
    sla: row.task_status === null ? 'none' : deskSla(row.due_at, row.task_status, now),
    contact_set: row.contact_set,
    updated_at: row.updated_at.toISOString(),
  };
}

export async function loadVendorDesk(
  pool: pg.Pool,
  adminUid: string,
  view: VendorDeskView,
  now: Date,
): Promise<VendorDeskThread[]> {
  const { rows } = await withAdminReader(pool, adminUid, (tx) =>
    tx.query<ThreadRow>(
      `${THREAD_SELECT} WHERE ${VIEW_FILTER[view]}
       ORDER BY c.due_at ASC NULLS LAST, t.updated_at DESC LIMIT 200`,
    ),
  );
  return rows.map((row) => toThread(row, now));
}

interface MessageRow {
  id: string;
  direction: 'outbound' | 'inbound';
  proposed_by: VendorDeskDetail['messages'][number]['proposed_by'];
  body: string;
  status: VendorDeskDetail['messages'][number]['status'];
  approved_at: Date | null;
  approved_text_sha256: string | null;
  approval_op_id: string | null;
  sent_at: Date | null;
  template_name: string | null;
  created_at: Date;
  reply: VendorDeskDetail['messages'][number]['reply'];
}

export async function loadVendorThread(
  pool: pg.Pool,
  operators: OperatorDirectory,
  adminUid: string,
  threadId: string,
  context: { readonly now: Date; readonly deskSends: boolean; readonly hours: DeskHours },
): Promise<VendorDeskDetail | null> {
  const loaded = await withAdminReader(pool, adminUid, async (tx) => {
    const thread = await tx.query<ThreadRow>(`${THREAD_SELECT} WHERE t.id = $1`, [threadId]);
    const row = thread.rows[0];
    if (row === undefined) return null;
    const messages = await tx.query<MessageRow>(
      `SELECT m.id, m.direction, m.proposed_by, m.body, m.status, m.approved_at,
              m.approved_text_sha256, a.op_id AS approval_op_id, m.sent_at, m.template_name,
              m.created_at, m.reply
         FROM ops.vendor_messages m LEFT JOIN ops.approvals a ON a.id = m.approval_id
        WHERE m.thread_id = $1 AND m.status <> 'superseded'
        ORDER BY m.created_at`,
      [threadId],
    );
    const notes = await tx.query<{
      notes: { at: string; admin_id: string | null; text: string }[];
    }>('SELECT notes FROM ops.concierge_tasks WHERE id = $1', [row.task_id]);
    return { row, messages: messages.rows, notes: notes.rows[0]?.notes ?? [] };
  });
  if (loaded === null) return null;
  const emails = await operators.emails([
    ...new Set(loaded.notes.flatMap((note) => (note.admin_id ? [note.admin_id] : []))),
  ]);
  const { row, now } = { row: loaded.row, now: context.now };
  return {
    thread: toThread(row, now),
    messages: loaded.messages.map((message) => ({
      ...message,
      approved_at: message.approved_at?.toISOString() ?? null,
      sent_at: message.sent_at?.toISOString() ?? null,
      created_at: message.created_at.toISOString(),
    })),
    notes: loaded.notes.map((note) => ({
      at: note.at,
      admin: note.admin_id ? (emails.get(note.admin_id) ?? note.admin_id) : 'system',
      text: note.text,
    })),
    desk_sends: context.deskSends,
    in_window:
      row.last_inbound_at !== null &&
      now.getTime() - row.last_inbound_at.getTime() < WHATSAPP_SERVICE_WINDOW_MS,
    desk_hours: context.hours,
  };
}
