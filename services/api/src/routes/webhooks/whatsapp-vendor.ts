/**
 * `/webhooks/whatsapp/vendor` (docs/api-contracts.md §5.9): the desk number's WhatsApp Cloud API
 * webhook, registered in its own Meta app so the sign-in number's `/webhooks/whatsapp` stays
 * separate. `GET` answers Meta's verify-token handshake; every `POST` must carry a valid
 * `X-Hub-Signature-256` or is refused before its body is read.
 *
 * - A delivery status moves our message forward (sent → delivered → read, or failed), never back.
 * - A reply from a vendor's number goes to that vendor's most recent open thread, verbatim and
 *   untrusted, once per WhatsApp message id; the thread shows "replied", the desk task gets a note,
 *   and `vendor.reply_parse` reads its intent for the traveller's card. A number we never wrote to
 *   finds no thread and is dropped.
 *
 * Meta retries anything but a 2xx, so a processed payload always answers 200.
 */
import { sendInTx, withSystem } from '@cp/db';
import { SUPPLIER_QUEUES } from '@cp/domain';
import { parseWhatsAppWebhook, verifyWhatsAppSignature, type WhatsAppWebhook } from '@cp/suppliers';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';
import {
  contactHash,
  noteTask,
  vendorEvent,
  type VendorMessageRow,
} from '../../suppliers/vendor-store';

export interface VendorWebhookDeps {
  readonly pool: pg.Pool;
  readonly appSecret: string;
  readonly verifyToken: string;
  readonly pepper: string;
}

const FORWARD: Readonly<Record<string, readonly string[]>> = {
  sent: [],
  delivered: ['sent'],
  read: ['sent', 'delivered'],
  failed: ['sent', 'delivered'],
};

type ThreadRef = Pick<VendorMessageRow, 'thread_id' | 'trip_id' | 'crew_id' | 'task_id'> & {
  vendor_name: string;
};

export interface VendorWebhookOutcome {
  readonly replies: number;
  readonly statuses: number;
  readonly unmatched: number;
}

export async function applyVendorWebhook(
  pool: pg.Pool,
  pepper: string,
  payload: WhatsAppWebhook,
): Promise<VendorWebhookOutcome> {
  return withSystem(pool, async (tx) => {
    let statuses = 0;
    for (const status of payload.statuses) {
      const { rows } = await tx.query<VendorMessageRow>(
        `UPDATE ops.vendor_messages m SET status = $2, version = m.version + 1,
                failure_reason = CASE WHEN $2 = 'failed' THEN $4 ELSE m.failure_reason END
          WHERE m.wa_message_id = $1 AND m.status = ANY($3::text[])
          RETURNING m.id, m.thread_id, m.trip_id,
                    (SELECT crew_id FROM trips WHERE id = m.trip_id) AS crew_id`,
        [
          status.waMessageId,
          status.status,
          FORWARD[status.status],
          status.errorCode === null ? 'whatsapp_error' : `whatsapp_${status.errorCode}`,
        ],
      );
      const moved = rows[0];
      if (moved === undefined) continue;
      statuses += 1;
      if (status.status === 'failed') {
        await vendorEvent(tx, 'vendor_msg.failed', moved, { kind: 'system', id: null });
      }
    }
    let replies = 0;
    let unmatched = 0;
    for (const message of payload.messages) {
      const thread = await tx.query<ThreadRef>(
        `SELECT t.id AS thread_id, t.trip_id, tr.crew_id, t.task_id, t.vendor_name
           FROM ops.vendor_threads t JOIN trips tr ON tr.id = t.trip_id
          WHERE t.wa_contact_hash = $1 AND t.status <> 'closed'
          ORDER BY t.updated_at DESC LIMIT 1 FOR UPDATE OF t`,
        [contactHash(pepper, message.from)],
      );
      const ref = thread.rows[0];
      if (ref === undefined) {
        unmatched += 1;
        continue;
      }
      const body = (message.text ?? `(${message.type} message)`).slice(0, 4096) || '(empty)';
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, proposed_by, body, status,
           wa_message_id)
         VALUES ($1, $2, 'inbound', 'vendor', $3, 'received', $4)
         ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
        [ref.thread_id, ref.trip_id, body, message.waMessageId],
      );
      const id = inserted.rows[0]?.id;
      if (id === undefined) continue;
      replies += 1;
      await tx.query(
        `UPDATE ops.vendor_threads SET status = 'replied', last_inbound_at = $2,
           version = version + 1 WHERE id = $1`,
        [ref.thread_id, Number.isNaN(message.at.getTime()) ? new Date() : message.at],
      );
      await noteTask(tx, ref.task_id, `${ref.vendor_name} replied`, new Date());
      await vendorEvent(tx, 'vendor_msg.replied', { ...ref, id }, { kind: 'system', id: null });
      if (message.text !== null) {
        await sendInTx(tx, SUPPLIER_QUEUES.replyParse, { message_id: id }, { singletonKey: id });
      }
    }
    return { replies, statuses, unmatched };
  });
}

export function registerVendorWebhookRoutes(
  app: OpenAPIHono<AppEnv>,
  deps: VendorWebhookDeps,
): void {
  app.get('/webhooks/whatsapp/vendor', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    if (mode === 'subscribe' && token === deps.verifyToken && challenge !== undefined) {
      return c.text(challenge, 200);
    }
    return c.text('forbidden', 403);
  });

  app.post('/webhooks/whatsapp/vendor', async (c) => {
    const rawBody = await c.req.text();
    if (!verifyWhatsAppSignature(deps.appSecret, rawBody, c.req.header('X-Hub-Signature-256'))) {
      return c.json(
        { error: { code: 'AUTH_REQUIRED', message: 'invalid signature', retryable: false } },
        401,
      );
    }
    const payload = parseWhatsAppWebhook(rawBody);
    if (payload === null) {
      return c.json(
        { error: { code: 'VALIDATION', message: 'not a WhatsApp payload', retryable: false } },
        422,
      );
    }
    const outcome = await applyVendorWebhook(deps.pool, deps.pepper, payload);
    return c.json({ received: true, ...outcome }, 200);
  });
}
