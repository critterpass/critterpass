/**
 * `approve_vendor_message {draft_id, text}` (app or notification action): the requester approves
 * the exact text they were shown. The approval goes to `ops.approvals` as the user (with the
 * command's op id), the draft keeps the text's SHA-256, and the desk gets a `vendor_message` task
 * due within its send window (from the next opening when the desk is closed). A text that differs
 * from the draft by a single character is not an approval of it: `STATE_INVALID {reason:
 * text_changed}`, and the app shows the current draft again. A draft the traveller sends from
 * their own WhatsApp needs no desk approval.
 */
import {
  approvalMatches,
  approveVendorMessagePayloadSchema,
  deskDueAt,
  DomainError,
  generateUuidV7,
  VENDOR_MESSAGE_SUBJECT,
  type ApproveVendorMessageResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { deskHours, lockVendorMessage, sha256Hex, vendorEvent } from '../../suppliers/vendor-store';
import { defineCommand } from '../_framework/define-command';

export const approveVendorMessageCommand = defineCommand({
  name: 'approve_vendor_message',
  v: 1,
  schema: approveVendorMessagePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const message = await asSystemRole(tx, () => lockVendorMessage(tx, payload.draft_id));
    if (message.requested_by !== ctx.uid || message.direction !== 'outbound') {
      throw new DomainError('NOT_FOUND', { reason: 'draft' });
    }
  },
  handle: async (tx, payload, ctx): Promise<ApproveVendorMessageResult> => {
    const message = await asSystemRole(tx, () => lockVendorMessage(tx, payload.draft_id));
    const hours = await asSystemRole(tx, () => deskHours(tx));
    if (message.status === 'approved' && message.task_id !== null) {
      return {
        draft_id: message.id,
        status: 'approved',
        task_id: message.task_id,
        desk_hours: hours,
      };
    }
    if (message.status !== 'draft') {
      throw new DomainError('STATE_INVALID', { reason: 'not_a_draft', state: message.status });
    }
    if (message.channel === 'self_send') {
      throw new DomainError('STATE_INVALID', { reason: 'self_send' });
    }
    if (!approvalMatches(payload.text, message.body)) {
      throw new DomainError('STATE_INVALID', { reason: 'text_changed' });
    }
    const approvalId = generateUuidV7();
    await tx.query(
      `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown, op_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [approvalId, ctx.uid, VENDOR_MESSAGE_SUBJECT, message.id, payload.text, ctx.opId],
    );
    const now = ctx.clock.serverNow;
    return asSystemRole(tx, async () => {
      await tx.query(
        `UPDATE ops.vendor_messages
            SET status = 'approved', approved_by_user_id = $2, approved_at = $3, approval_id = $4,
                approved_text_sha256 = $5, version = version + 1
          WHERE id = $1`,
        [message.id, ctx.uid, now, approvalId, sha256Hex(message.body)],
      );
      let taskId = message.task_id;
      if (taskId === null) {
        const task = await tx.query<{ id: string }>(
          `INSERT INTO ops.concierge_tasks (kind, trip_id, requested_by, approval_id, due_at, notes)
           VALUES ('vendor_message', $1, $2, $3, $4, jsonb_build_array(jsonb_build_object(
             'at', $5::text, 'admin_id', NULL, 'text', 'Traveller approved the text', 'system', true)))
           RETURNING id`,
          [message.trip_id, ctx.uid, approvalId, deskDueAt(now, hours), now.toISOString()],
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
          [taskId, approvalId, deskDueAt(now, hours)],
        );
      }
      await vendorEvent(
        tx,
        'vendor_msg.approved',
        message,
        { kind: 'user', id: ctx.uid },
        {
          task_id: taskId,
        },
      );
      return { draft_id: message.id, status: 'approved', task_id: taskId, desk_hours: hours };
    });
  },
});
