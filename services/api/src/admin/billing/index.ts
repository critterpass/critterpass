/**
 * The billing console area (support): reads, commands, the nav badge (failed webhooks in the last
 * day plus first trip free grants to review) and the RevenueCat provider for `replay_webhook`,
 * which re-applies a stored event through the same idempotent apply step the worker runs.
 */
import type pg from 'pg';

import { applyBillingEvent } from '../../billing/apply-event';
import { billingEnvSchema } from '../../billing/register';
import { createRevenueCatClient } from '../../billing/rc-client';
import { defineAdminArea } from '../registry';
import { defineWebhookReplay } from '../webhook-replay';
import { appStoreServerApiFromEnv } from './app-store';
import { billingCommands } from './commands';
import { billingHealth, billingReads } from './reads';

let replayRegistered = false;

export function billingArea(
  pool: pg.Pool,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const parsed = billingEnvSchema.parse(env);
  const revenuecat =
    parsed.REVENUECAT_SECRET_API_KEY === undefined
      ? undefined
      : createRevenueCatClient({ secretKey: parsed.REVENUECAT_SECRET_API_KEY });
  if (!replayRegistered) {
    replayRegistered = true;
    defineWebhookReplay<{ id: string }>({
      provider: 'revenuecat',
      load: async (tx, eventId) => {
        const { rows } = await tx.query<{ id: string }>(
          "SELECT id FROM billing_events WHERE source = 'revenuecat' AND event_id = $1",
          [eventId],
        );
        return rows[0] ?? null;
      },
      reapply: (tx, event) => applyBillingEvent(tx, { revenuecat }, event.id, { replay: true }),
    });
  }
  return defineAdminArea({
    id: 'billing',
    reads: billingReads(pool),
    commands: billingCommands(appStoreServerApiFromEnv(env)),
    count: {
      area: 'billing',
      run: async (tx) => {
        const health = await billingHealth(tx);
        const count = health.failed_24h + health.ftf_to_review;
        return { count, tone: health.failed_24h > 0 ? 'urgent' : count > 0 ? 'warn' : 'plain' };
      },
    },
  });
}
