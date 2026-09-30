/**
 * `vendor.reply_parse` (queued by the WhatsApp webhook, one job per inbound reply): reads a place's
 * reply to the ops desk into the traveller's card. The reply is screened on the `imported_text`
 * surface first and then read on the `vendor.reply_intent` decision route with the message it
 * answers (packages/ai/src/routes/vendor-reply); times and prices are the ones written in it.
 * A reply the screen or the reader is not sure about goes to a person at the desk with a task note,
 * and so does every reply while no model is configured. Nothing is ever done because of a reply:
 * the card shows it verbatim with the reading beside it.
 */
import { checkCompliance, extractReplyFacts, readVendorReply, type DecisionClient } from '@cp/ai';
import { appendDomainEvent, withSystem } from '@cp/db';
import { SUPPLIER_QUEUES, type VendorReplyView } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob } from '../../boss';

interface ReplyRow {
  id: string;
  thread_id: string;
  trip_id: string;
  crew_id: string;
  body: string;
  task_id: string | null;
  vendor_name: string;
  asked: string | null;
}

export type ReplyParseOutcome = 'parsed' | 'person' | 'gone';

export async function parseVendorReply(
  pool: pg.Pool,
  messageId: string,
  decisions: DecisionClient | undefined,
): Promise<ReplyParseOutcome> {
  const row = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ReplyRow>(
      `SELECT m.id, m.thread_id, m.trip_id, tr.crew_id, m.body, t.task_id, t.vendor_name,
              (SELECT o.body FROM ops.vendor_messages o
                WHERE o.thread_id = m.thread_id AND o.direction = 'outbound'
                  AND o.status IN ('sent', 'delivered', 'read')
                ORDER BY o.sent_at DESC NULLS LAST LIMIT 1) AS asked
         FROM ops.vendor_messages m
         JOIN ops.vendor_threads t ON t.id = m.thread_id
         JOIN trips tr ON tr.id = m.trip_id
        WHERE m.id = $1 AND m.direction = 'inbound' AND m.reply IS NULL`,
      [messageId],
    );
    return rows[0];
  });
  if (row === undefined) return 'gone';
  let reply: VendorReplyView;
  if (decisions === undefined) {
    reply = { intent: 'unclear', ...extractReplyFacts(row.body), needs_person: true };
  } else {
    const screen = await checkCompliance(
      { decisions },
      { surface: 'imported_text', text: row.body },
    );
    reply = await readVendorReply(decisions, {
      asked: row.asked ?? '',
      reply: row.body,
      screen: screen.outcome,
    });
  }
  return withSystem(pool, async (tx) => {
    const updated = await tx.query(
      `UPDATE ops.vendor_messages SET reply = $2::jsonb, version = version + 1
        WHERE id = $1 AND reply IS NULL`,
      [row.id, JSON.stringify(reply)],
    );
    if ((updated.rowCount ?? 0) === 0) return 'gone';
    if (reply.needs_person && row.task_id !== null) {
      await tx.query(
        `UPDATE ops.concierge_tasks
            SET notes = notes || jsonb_build_array(jsonb_build_object('at', now()::text,
                  'admin_id', NULL, 'text', $2::text, 'system', true)),
                status = CASE WHEN status IN ('done', 'cancelled') THEN 'in_progress' ELSE status END,
                version = version + 1
          WHERE id = $1`,
        [row.task_id, `${row.vendor_name}'s reply needs a person to read it`],
      );
    }
    await appendDomainEvent(tx, {
      type: 'vendor_msg.reply_parsed',
      aggregateKind: 'vendor_message',
      aggregateId: row.id,
      actorKind: 'system',
      actorId: null,
      crewId: row.crew_id,
      tripId: row.trip_id,
      payload: {
        trip_id: row.trip_id,
        thread_id: row.thread_id,
        message_id: row.id,
        intent: reply.intent,
        needs_person: reply.needs_person,
      },
    });
    return reply.needs_person ? 'person' : 'parsed';
  });
}

export function vendorReplyParseJob(decisions: DecisionClient | undefined) {
  return defineJob({
    queue: SUPPLIER_QUEUES.replyParse,
    schema: z.object({ message_id: z.uuid() }),
    handler: async (data, ctx) => ({
      outcome: await parseVendorReply(ctx.pool, data.message_id, decisions),
    }),
  });
}
