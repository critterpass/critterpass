/**
 * `send_vendor_message {draft_id}` (ops desk, audited through the console's command pipeline): a
 * person at the desk sends an approved message through the desk's WhatsApp Business number. The
 * handler refuses anything its requester did not approve word for word (`APPROVAL_REQUIRED`), and
 * the database trigger on `ops.vendor_messages` refuses it again. Inside WhatsApp's 24-hour window
 * the text goes as a plain message, outside it inside the approved template. Sending twice
 * answers the first send.
 */
import {
  approvalMatches,
  DomainError,
  VENDOR_MESSAGE_SUBJECT,
  WHATSAPP_SERVICE_WINDOW_MS,
} from '@cp/domain';
import { toSupplierDomainError } from '@cp/suppliers';
import type pg from 'pg';

import { assertApproved } from '../../admin/desk';
import {
  deskSends,
  lockVendorMessage,
  noteTask,
  openContact,
  sha256Hex,
  vendorEvent,
  type VendorDeps,
} from '../../suppliers/vendor-store';

export interface SendVendorMessageResult {
  readonly draft_id: string;
  readonly status: 'sent';
  readonly wa_message_id: string;
  readonly template: string | null;
}

export async function sendVendorMessage(
  tx: pg.PoolClient,
  deps: VendorDeps,
  input: { readonly draftId: string; readonly adminUid: string; readonly now: Date },
): Promise<SendVendorMessageResult> {
  const message = await lockVendorMessage(tx, input.draftId);
  if (message.direction !== 'outbound') throw new DomainError('NOT_FOUND', { reason: 'draft' });
  if (message.status === 'sent' || message.status === 'delivered' || message.status === 'read') {
    const { rows } = await tx.query<{ wa_message_id: string; template_name: string | null }>(
      'SELECT wa_message_id, template_name FROM ops.vendor_messages WHERE id = $1',
      [message.id],
    );
    return {
      draft_id: message.id,
      status: 'sent',
      wa_message_id: rows[0]?.wa_message_id ?? '',
      template: rows[0]?.template_name ?? null,
    };
  }
  if (message.status !== 'approved' || message.approved_by_user_id === null) {
    throw new DomainError('APPROVAL_REQUIRED', { subject_kind: VENDOR_MESSAGE_SUBJECT });
  }
  const approval = await assertApproved(tx, {
    kind: VENDOR_MESSAGE_SUBJECT,
    id: message.id,
    userId: message.approved_by_user_id,
  });
  if (
    approval.id !== message.approval_id ||
    !approvalMatches(approval.textShown, message.body) ||
    message.approved_text_sha256 !== sha256Hex(message.body)
  ) {
    throw new DomainError('APPROVAL_REQUIRED', { subject_kind: VENDOR_MESSAGE_SUBJECT });
  }
  if (!(await deskSends(tx, deps)) || deps.whatsapp === undefined) {
    throw new DomainError('SUPPLIER_UNAVAILABLE', { supplier: 'whatsapp', reason: 'flag_off' });
  }
  if (message.wa_contact_enc === null) {
    throw new DomainError('STATE_INVALID', { reason: 'no_contact' });
  }
  const to = openContact(deps, message.wa_contact_enc);
  const inWindow =
    message.last_inbound_at !== null &&
    input.now.getTime() - message.last_inbound_at.getTime() < WHATSAPP_SERVICE_WINDOW_MS;
  let sent;
  try {
    sent = inWindow
      ? await deps.whatsapp.sendText(to, message.body)
      : await deps.whatsapp.sendTemplate(to, message.body);
  } catch (error) {
    throw toSupplierDomainError(error, 'whatsapp');
  }
  await tx.query(
    `UPDATE ops.vendor_messages
        SET status = 'sent', wa_message_id = $2, template_name = $3, sent_by_admin_id = $4,
            sent_at = $5, version = version + 1
      WHERE id = $1`,
    [message.id, sent.waMessageId, sent.templateName, input.adminUid, input.now],
  );
  await tx.query(
    "UPDATE ops.vendor_threads SET status = 'waiting_reply', version = version + 1 WHERE id = $1",
    [message.thread_id],
  );
  await tx.query(
    "UPDATE ops.concierge_tasks SET status = 'in_progress' WHERE id = $1 AND status = 'new'",
    [message.task_id],
  );
  await noteTask(tx, message.task_id, 'Sent the approved text', input.now, input.adminUid);
  await vendorEvent(tx, 'vendor_msg.sent', message, { kind: 'system', id: input.adminUid });
  return {
    draft_id: message.id,
    status: 'sent',
    wa_message_id: sent.waMessageId,
    template: sent.templateName,
  };
}
