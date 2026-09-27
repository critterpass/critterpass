/**
 * `approve_ops_action {subject_kind, subject_id, text_shown}`: the user approves the exact text ops
 * will send or book on their behalf. The approval row is written as the user (the one app_user
 * carve-out in `ops`), keyed by the command's op_id, and linked to its subject as app_system; the
 * subject kind decides who may approve it. Outbound actions check it with `assertApproved`.
 */
import { DomainError, approveOpsActionPayloadSchema, generateUuidV7 } from '@cp/domain';

import { asSystemRole } from '../admin/command';
import { approvalSubject } from '../admin/desk';
import { defineCommand } from './_framework/define-command';

export const approveOpsActionCommand = defineCommand({
  name: 'approve_ops_action',
  v: 1,
  schema: approveOpsActionPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const subject = approvalSubject(payload.subject_kind);
    if (subject === undefined) {
      throw new DomainError('VALIDATION', {
        reason: 'unknown_subject',
        kind: payload.subject_kind,
      });
    }
    const allowed = await asSystemRole(tx, () =>
      subject.canApprove(tx, ctx.uid, payload.subject_id),
    );
    if (!allowed) throw new DomainError('NOT_FOUND');
  },
  handle: async (tx, payload, ctx) => {
    const approvalId = generateUuidV7();
    await tx.query(
      `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown, op_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [approvalId, ctx.uid, payload.subject_kind, payload.subject_id, payload.text_shown, ctx.opId],
    );
    const subject = approvalSubject(payload.subject_kind);
    if (subject?.onApproved !== undefined) {
      const link = subject.onApproved;
      await asSystemRole(tx, () => link(tx, payload.subject_id, approvalId));
    }
    return { approval_id: approvalId };
  },
});
