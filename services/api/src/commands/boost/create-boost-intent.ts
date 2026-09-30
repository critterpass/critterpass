/**
 * `create_boost_intent` (docs/api-contracts.md §4.15): a seated member takes the trip's boost lock
 * before paying, for 15 minutes. One lock per trip: while someone holds it, anyone else gets
 * `BOOST_INTENT_LOCKED {by_uid, until}` ("{name} is boosting…"); the holder opening the sheet again
 * replaces their own lock. The trip's row lock serialises two members racing for it, and the
 * partial unique index on open intents backs that up. A split names seated members only, the
 * buyer among them.
 */
import { emitEvent, scheduleEvent } from '@cp/db';
import {
  BILLING_QUEUES,
  BOOST_INTENT_LOCK_MINUTES,
  createBoostIntentPayloadSchema,
  DomainError,
  type CreateBoostIntentResult,
} from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { publishIntentLock } from '../../billing/boost-rt';
import { closeIntent } from '../../billing/activate-boost';
import { requireAllInTrip, requireMoneyMember, tripMoneyMembers } from '../money/shared';
import { defineCommand } from '../_framework/define-command';
import type { BillingCommandDeps } from '../billing/fulfil-purchase';

interface HeldLock {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly expires_at: Date;
}

/** Whether the trip can still take a boost of `product` (not over, not already covered). */
async function requireBoostable(
  tx: pg.PoolClient,
  tripId: string,
  product: 'boost_trip' | 'boost_crew_year',
  now: Date,
): Promise<void> {
  const { rows } = await tx.query<{
    status: string;
    ended: boolean;
    boosted: boolean;
    year: boolean;
  }>(
    `SELECT t.status,
            (t.end_date IS NOT NULL AND app.boost_window_end(t.id, $2) <= $2) AS ended,
            EXISTS (SELECT 1 FROM trip_boosts b WHERE b.trip_id = t.id
                     AND b.status IN ('scheduled', 'active')) OR
            EXISTS (SELECT 1 FROM ftf_grants g WHERE g.trip_id = t.id
                     AND g.abuse_decision <> 'revoked' AND g.ends_at > $2) AS boosted,
            EXISTS (SELECT 1 FROM crew_year_grants y WHERE y.crew_id = t.crew_id
                     AND y.revoked_at IS NULL AND $2 BETWEEN y.valid_from AND y.valid_to) AS year
       FROM trips t WHERE t.id = $1 FOR UPDATE OF t`,
    [tripId, now],
  );
  const trip = rows[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  if (['post_trip', 'archived', 'cancelled'].includes(trip.status) || trip.ended) {
    throw new DomainError('STATE_INVALID', { reason: 'trip_ended' });
  }
  if (trip.year || (product === 'boost_trip' && trip.boosted)) {
    throw new DomainError('STATE_INVALID', { reason: 'already_boosted' });
  }
}

export function createBoostIntentCommand(deps: Pick<BillingCommandDeps, 'switches'>) {
  return defineCommand({
    name: 'create_boost_intent',
    v: 1,
    schema: createBoostIntentPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await deps.switches.assertOn('billing.enabled');
      await requireMoneyMember(tx, payload.trip_id, ctx.uid);
    },
    handle: async (tx, payload, ctx): Promise<CreateBoostIntentResult> => {
      const trip = await requireMoneyMember(tx, payload.trip_id, ctx.uid);
      const members = payload.split_mode === 'split' ? [...new Set(payload.member_uids)] : [];
      if (payload.split_mode === 'split') {
        if (!members.includes(ctx.uid) || members.length < 2) {
          throw new DomainError('VALIDATION', { reason: 'split_needs_buyer_and_one_more' });
        }
        requireAllInTrip(await tripMoneyMembers(tx, payload.trip_id), members);
      }
      const now = ctx.clock.serverNow;
      const expiresAt = new Date(now.getTime() + BOOST_INTENT_LOCK_MINUTES * 60_000);
      return asServer(tx, async () => {
        await requireBoostable(tx, payload.trip_id, payload.product_key, now);
        const { rows } = await tx.query<HeldLock>(
          `SELECT id, trip_id, crew_id, buyer_id, expires_at FROM boost_intents
            WHERE trip_id = $1 AND status IN ('open', 'purchasing') FOR UPDATE`,
          [payload.trip_id],
        );
        const held = rows[0];
        if (held !== undefined && held.expires_at > now && held.buyer_id !== ctx.uid) {
          throw new DomainError('BOOST_INTENT_LOCKED', {
            by_uid: held.buyer_id,
            until: held.expires_at.toISOString(),
          });
        }
        if (held !== undefined) {
          await closeIntent(tx, held, held.expires_at > now ? 'cancelled' : 'expired');
        }
        await tx.query(
          `INSERT INTO boost_intents (id, trip_id, crew_id, buyer_id, product_key, split_mode,
             split_member_ids, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            payload.intent_id,
            payload.trip_id,
            trip.crew_id,
            ctx.uid,
            payload.product_key,
            payload.split_mode,
            members,
            expiresAt,
          ],
        );
        await scheduleEvent(tx, {
          kind: BILLING_QUEUES.intentExpiry,
          refId: payload.intent_id,
          tz: 'UTC',
          at: expiresAt,
        });
        await publishIntentLock(tx, payload.trip_id, {
          intentId: payload.intent_id,
          byUid: ctx.uid,
          until: expiresAt,
        });
        await emitEvent(tx, {
          type: 'boost.intent_locked',
          aggregateKind: 'boost_intent',
          aggregateId: payload.intent_id,
          actorKind: 'user',
          actorId: ctx.uid,
          crewId: trip.crew_id,
          tripId: payload.trip_id,
          payload: {
            trip_id: payload.trip_id,
            crew_id: trip.crew_id,
            intent_id: payload.intent_id,
            buyer_id: ctx.uid,
          },
        });
        return {
          intent_id: payload.intent_id,
          subscriber_attribute: { key: 'boost_intent_id', value: payload.intent_id },
          app_account_token: ctx.uid,
          expires_at: expiresAt.toISOString(),
        };
      });
    },
  });
}
