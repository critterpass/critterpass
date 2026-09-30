/**
 * `POST /webhooks/aeroapi/{secret}` (docs/api-contracts.md §5.8): FlightAware AeroAPI alert
 * deliveries. AeroAPI does not sign them, so the path carries a secret (compared in constant time)
 * and nothing in the body is trusted: the worker's `flight.event` refetches the flight by its id
 * from AeroAPI before anything changes or anyone is pushed, and drops an alert no watch knows.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import { sendInTx, withSystem } from '@cp/db';
import { BOOKINGS_QUEUES, DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../../app';

/** What an alert delivery says (AeroAPI v4 alert payload; only its ids are used). */
const alertSchema = z.object({
  alert_id: z.union([z.number(), z.string().max(64)]).transform(String),
  event_code: z.string().max(40),
  flight: z.object({ fa_flight_id: z.string().min(1).max(128) }).passthrough(),
});

const digest = (value: string) => createHash('sha256').update(value).digest();

export function registerAeroApiWebhook(
  app: OpenAPIHono<AppEnv>,
  deps: { readonly pool: pg.Pool; readonly secret: string },
): void {
  const expected = digest(deps.secret);
  app.post('/webhooks/aeroapi/:secret', async (c) => {
    if (!timingSafeEqual(digest(c.req.param('secret')), expected)) {
      throw new DomainError('NOT_FOUND', { reason: 'webhook' });
    }
    const parsed = alertSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('VALIDATION', { reason: 'bad_alert' });
    const alert = parsed.data;
    await withSystem(deps.pool, (tx) =>
      sendInTx(
        tx,
        BOOKINGS_QUEUES.flightEvent,
        {
          alert_id: alert.alert_id,
          fa_flight_id: alert.flight.fa_flight_id,
          event_code: alert.event_code,
        },
        { singletonKey: `${alert.flight.fa_flight_id}:${alert.alert_id}:${alert.event_code}` },
      ),
    );
    return c.json({ ok: true });
  });
}
