/**
 * `POST /webhooks/print/{secret_token}`: the print partner's order callbacks. The path carries an
 * unguessable token (compared in constant time) and nothing in the body is trusted: it only names
 * which order to look at, and `postcard.status` re-reads that order from the printer before any
 * status changes. A callback for an order no mailing holds is acknowledged and dropped.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { sendInTx, withSystem } from '@cp/db';
import { ALBUM_QUEUES, DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';

import type { AppEnv } from '../../app';

const digest = (value: string) => createHash('sha256').update(value).digest();

const ORDER_ID = /^ord_[A-Za-z0-9]{1,64}$/u;

/** The order id a callback names (CloudEvents `subject`, or the order inside `data`), if any. */
export function callbackOrderId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;
  const data = record['data'];
  const order =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>)['order']
      : undefined;
  const candidates = [
    record['subject'],
    typeof order === 'object' && order !== null
      ? (order as Record<string, unknown>)['id']
      : undefined,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && ORDER_ID.test(value)) return value;
  }
  return null;
}

export function registerPrintWebhook(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly token: string },
): void {
  const expected = digest(deps.token);
  app.post('/webhooks/print/:token', async (c) => {
    if (!timingSafeEqual(digest(c.req.param('token')), expected)) {
      throw new DomainError('NOT_FOUND', { reason: 'webhook' });
    }
    const orderId = callbackOrderId(await c.req.json().catch(() => null));
    if (orderId === null) return c.json({ ok: true });
    await withSystem(deps.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM postcard_mailings
          WHERE jsonb_path_exists(tracking, '$.orders.* ? (@.ref == $ref)', jsonb_build_object('ref', $1::text))`,
        [orderId],
      );
      const mailing = rows[0];
      if (mailing === undefined) return;
      await sendInTx(
        tx,
        ALBUM_QUEUES.postcardStatus,
        { mailing_id: mailing.id },
        { singletonKey: mailing.id },
      );
    });
    return c.json({ ok: true });
  });
}
