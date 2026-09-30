/**
 * `release_boost_intent`: the buyer backs out (or the store sheet was cancelled), freeing the
 * trip's lock at once. Releasing a lock that already closed is a no-op; only its holder may.
 */
import { DomainError, releaseBoostIntentPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { closeIntent } from '../../billing/activate-boost';
import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

interface IntentRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly status: string;
  readonly expires_at: Date;
}

async function loadIntent(tx: pg.PoolClient, id: string, lock = true): Promise<IntentRow> {
  const { rows } = await tx.query<IntentRow>(
    `SELECT id, trip_id, crew_id, buyer_id, status, expires_at FROM boost_intents
      WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
    [id],
  );
  const intent = rows[0];
  if (intent === undefined) throw new DomainError('NOT_FOUND', { reason: 'intent' });
  return intent;
}

export const releaseBoostIntentCommand = defineCommand({
  name: 'release_boost_intent',
  v: 1,
  schema: releaseBoostIntentPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const intent = await loadIntent(tx, payload.intent_id, false);
    if (intent.buyer_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_buyer' });
  },
  handle: (tx, payload) =>
    asServer(tx, async () => {
      const intent = await loadIntent(tx, payload.intent_id);
      if (intent.status !== 'open' && intent.status !== 'purchasing') {
        return { intent_id: intent.id, status: intent.status };
      }
      await closeIntent(tx, intent, 'cancelled');
      return { intent_id: intent.id, status: 'cancelled' };
    }),
});

/** The expiry timer's step: an intent still open past its time lapses (idempotent). */
export async function expireIntent(tx: pg.PoolClient, intentId: string, now: Date) {
  const intent = await loadIntent(tx, intentId);
  if ((intent.status !== 'open' && intent.status !== 'purchasing') || intent.expires_at > now) {
    return { intent_id: intent.id, status: intent.status };
  }
  await closeIntent(tx, intent, 'expired');
  return { intent_id: intent.id, status: 'expired' };
}
