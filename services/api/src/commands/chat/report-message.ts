/**
 * `report_message` (docs/api-contracts.md §4.2, doc delta): a member reports a crewmate's message
 * to the ops queue (`moderation_reports`, kind `message`). The same filing rules as
 * `report_content` apply: the daily cap and collapsing into an open report of the same message.
 */
import { DomainError, reportMessagePayloadSchema, type ReportContentResult } from '@cp/domain';

import { reportContentCommand } from '../report-content';
import { defineCommand } from '../_framework/define-command';
import { requireChatWriter, visibleMessage } from './shared';
import { MESSAGE_MODERATION_KIND } from './moderation-kind';

export const reportMessageCommand = defineCommand({
  name: 'report_message',
  v: 1,
  schema: reportMessagePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const message = await visibleMessage(tx, payload.message_id);
    await requireChatWriter(tx, message.crew_id);
    if (message.sender_id === ctx.uid)
      throw new DomainError('VALIDATION', { reason: 'self_report' });
  },
  handle: (tx, payload, ctx): Promise<ReportContentResult> =>
    reportContentCommand.handle(
      tx,
      {
        kind: MESSAGE_MODERATION_KIND,
        id: payload.message_id,
        reason: payload.reason,
        note: payload.note ?? null,
      },
      ctx,
    ),
});
