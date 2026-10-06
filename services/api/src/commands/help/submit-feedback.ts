/**
 * `submit_feedback` (offline): a ticket from Settings, a help article or a shake. The client's own
 * id makes a queued replay land once, with the same ticket number. Attachments are the sender's own
 * `feedback` uploads; device info is kept only when the sender left "Include device info" on.
 * Support answers by email when the account has a verified address, else in the Inbox, and the
 * ticket is due a reply `feedback.reply_hours` (48 by default) after it arrives. Storing it queues
 * `feedback.forward`, which triages it and files it in the tracker.
 */
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  FEEDBACK_FORWARD_QUEUE,
  submitFeedbackPayloadSchema,
  type SubmitFeedbackResult,
} from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { parseMediaKey } from '../../media/purposes';
import { defineCommand } from '../_framework/define-command';

export const DEFAULT_FEEDBACK_REPLY_HOURS = 48;

async function replyHours(tx: pg.PoolClient): Promise<number> {
  const { rows } = await tx.query<{ value: unknown }>(
    "SELECT value FROM ops.ops_config WHERE key = 'feedback.reply_hours'",
  );
  const value = rows[0]?.value;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_FEEDBACK_REPLY_HOURS;
}

async function resolveMedia(
  tx: pg.PoolClient,
  uid: string,
  keys: readonly string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  for (const key of keys) {
    const parsed = parseMediaKey(key);
    if (parsed?.ownerId !== uid || parsed.purpose !== 'feedback') {
      throw new DomainError('NOT_FOUND', { reason: 'attachment' });
    }
  }
  const { rows } = await tx.query<{ id: string; r2_key: string }>(
    'SELECT id, r2_key FROM media_objects WHERE owner_id = $1 AND r2_key = ANY($2::text[])',
    [uid, keys],
  );
  const ids = new Map(rows.map((row) => [row.r2_key, row.id]));
  return keys.map((key) => {
    const id = ids.get(key);
    if (id === undefined) throw new DomainError('NOT_FOUND', { reason: 'attachment' });
    return id;
  });
}

export const submitFeedbackCommand = defineCommand({
  name: 'submit_feedback',
  v: 1,
  schema: submitFeedbackPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const tripId = payload.context.trip_id;
    if (tripId === null) return;
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [tripId],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async (): Promise<SubmitFeedbackResult> => {
      const existing = await tx.query<{ ticket_no: string; user_id: string }>(
        'SELECT ticket_no, user_id FROM feedback_tickets WHERE id = $1',
        [payload.id],
      );
      const found = existing.rows[0];
      if (found !== undefined) {
        if (found.user_id !== ctx.uid)
          throw new DomainError('IDEMPOTENCY_MISMATCH', { reason: 'ticket_id' });
        return { ticket_id: payload.id, ticket_no: Number(found.ticket_no) };
      }
      const mediaIds = await resolveMedia(tx, ctx.uid, payload.media_keys);
      const hours = await replyHours(tx);
      const { rows } = await tx.query<{ ticket_no: string }>(
        `INSERT INTO feedback_tickets (id, user_id, mood, category, body, include_device_info,
           device_info, context, trip_id, media_ids, source, reply_channel, reply_due_at,
           app_version, sent_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, app.feedback_reply_channel($2),
           now() + make_interval(hours => $12), $13, $14)
         RETURNING ticket_no`,
        [
          payload.id,
          ctx.uid,
          payload.mood,
          payload.category,
          payload.text.trim(),
          payload.include_device_info,
          payload.include_device_info && payload.device_info !== null
            ? JSON.stringify(payload.device_info)
            : null,
          JSON.stringify(payload.context),
          payload.context.trip_id,
          mediaIds,
          payload.source,
          hours,
          ctx.device.app_version,
          ctx.clock.effectiveClientTs,
        ],
      );
      const ticketNo = Number(rows[0]?.ticket_no);
      await emitEvent(tx, {
        type: 'feedback.submitted',
        aggregateKind: 'feedback_ticket',
        aggregateId: payload.id,
        actorKind: 'user',
        actorId: ctx.uid,
        tripId: payload.context.trip_id,
        payload: {
          ticket_id: payload.id,
          ticket_no: ticketNo,
          user_id: ctx.uid,
          mood: payload.mood,
          category: payload.category,
          source: payload.source,
          attachments: mediaIds.length,
        },
      });
      // Triage and the tracker forward follow in the worker, queued with the ticket itself.
      await sendInTx(
        tx,
        FEEDBACK_FORWARD_QUEUE,
        { ticket_id: payload.id },
        { singletonKey: payload.id },
      );
      return { ticket_id: payload.id, ticket_no: ticketNo };
    }),
});
