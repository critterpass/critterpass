/**
 * Billing console commands (support, each with a reason in the audit log): record a partner Offer
 * Code batch, allow or revoke a flagged first trip free, give a trip promotional Boost time, and
 * extend an App Store subscription as compensation (at most 90 days, twice a year per customer,
 * never to fulfil a sold gift). Replaying a stored RevenueCat event is `replay_webhook`.
 */
import { emitEvent } from '@cp/db';
import {
  DomainError,
  EXTEND_RENEWAL_MAX_PER_YEAR,
  extendStoreRenewalPayloadSchema,
  grantTripBoostPayloadSchema,
  recordOfferCodeBatchPayloadSchema,
  reviewFtfGrantPayloadSchema,
} from '@cp/domain';

import { armBoostExpiry } from '../../billing/activate-boost';
import { publishBoostState } from '../../billing/boost-rt';
import { recomputeTrip, recomputeUser } from '../../entitlements';
import { defineAdminCommand } from '../registry';
import type { AppStoreServerApi } from './app-store';

export function billingCommands(appStore: AppStoreServerApi | undefined) {
  return [
    defineAdminCommand({
      name: 'record_offer_code_batch',
      schema: recordOfferCodeBatchPayloadSchema,
      audit: (payload, result: { id: string }) => ({
        targetKind: 'offer_code_batch',
        targetId: result.id,
        summary: `${payload.name} · ${payload.platform} · ${payload.size} codes`,
      }),
      handle: async (tx, payload, ctx) => {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO ops.offer_code_batches (name, platform, offer_ref, size, notes, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [
            payload.name,
            payload.platform,
            payload.offer_ref,
            payload.size,
            payload.notes ?? null,
            ctx.admin.uid,
          ],
        );
        const id = rows[0]?.id;
        if (id === undefined) throw new Error('offer code batch insert returned no row');
        return { id };
      },
    }),
    defineAdminCommand({
      name: 'review_ftf_grant',
      schema: reviewFtfGrantPayloadSchema,
      audit: (payload) => ({
        targetKind: 'ftf_grant',
        targetId: payload.grant_id,
        reason: payload.reason,
        summary: `First trip free · ${payload.decision}`,
      }),
      handle: async (tx, payload) => {
        const decision = payload.decision === 'allow' ? 'allowed' : 'revoked';
        const { rows } = await tx.query<{ crew_id: string; trip_id: string }>(
          `UPDATE ftf_grants SET abuse_decision = $2, reviewed_at = now() WHERE id = $1
           RETURNING crew_id, trip_id`,
          [payload.grant_id, decision],
        );
        const grant = rows[0];
        if (grant === undefined) throw new DomainError('NOT_FOUND', { reason: 'grant' });
        await recomputeTrip(tx, grant.trip_id);
        const people = await tx.query<{ user_id: string }>(
          'SELECT user_id FROM trip_participants WHERE trip_id = $1',
          [grant.trip_id],
        );
        for (const person of people.rows) await recomputeUser(tx, person.user_id);
        await emitEvent(tx, {
          type: 'ftf.reviewed',
          aggregateKind: 'ftf_grant',
          aggregateId: payload.grant_id,
          actorKind: 'system',
          actorId: null,
          crewId: grant.crew_id,
          tripId: grant.trip_id,
          payload: { crew_id: grant.crew_id, grant_id: payload.grant_id, decision },
        });
        return { grant_id: payload.grant_id, decision };
      },
    }),
    defineAdminCommand({
      name: 'grant_trip_boost',
      schema: grantTripBoostPayloadSchema,
      audit: (payload, result: { boost_id: string }) => ({
        targetKind: 'trip',
        targetId: payload.trip_id,
        reason: payload.reason,
        summary: `Promotional Boost · ${payload.days} days`,
        detail: { boost_id: result.boost_id },
      }),
      handle: async (tx, payload) => {
        const { rows: live } = await tx.query(
          "SELECT 1 FROM trip_boosts WHERE trip_id = $1 AND status IN ('scheduled', 'active')",
          [payload.trip_id],
        );
        if (live.length > 0) throw new DomainError('STATE_INVALID', { reason: 'already_boosted' });
        const { rows } = await tx.query<{ id: string; crew_id: string; ends_at: Date }>(
          `INSERT INTO trip_boosts (trip_id, crew_id, source, starts_at, ends_at)
           SELECT id, crew_id, 'promo', now(), now() + make_interval(days => $2) FROM trips WHERE id = $1
           RETURNING id, crew_id, ends_at`,
          [payload.trip_id, payload.days],
        );
        const boost = rows[0];
        if (boost === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
        await armBoostExpiry(tx, boost.id, boost.ends_at);
        await publishBoostState(
          tx,
          { id: boost.id, tripId: payload.trip_id, crewId: boost.crew_id },
          'active',
        );
        await recomputeTrip(tx, payload.trip_id);
        return { boost_id: boost.id };
      },
    }),
    defineAdminCommand({
      name: 'extend_store_renewal',
      schema: extendStoreRenewalPayloadSchema,
      audit: (payload) => ({
        targetKind: 'user',
        targetId: payload.uid,
        reason: payload.reason,
        summary: `App Store renewal extended · ${payload.days} days`,
      }),
      handle: async (tx, payload) => {
        const { rows: used } = await tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM ops.admin_audit WHERE action = 'extend_store_renewal'
            AND target_kind = 'user' AND target_id = $1 AND at > now() - interval '365 days'`,
          [payload.uid],
        );
        if ((used[0]?.n ?? 0) >= EXTEND_RENEWAL_MAX_PER_YEAR) {
          throw new DomainError('STATE_INVALID', { reason: 'extension_quota_used' });
        }
        const { rows } = await tx.query<{ original_transaction_id: string | null }>(
          `SELECT original_transaction_id FROM subscriptions
            WHERE user_id = $1 AND platform = 'app_store' AND status IN ('active', 'cancelled_active', 'grace')
            ORDER BY period_end DESC NULLS LAST LIMIT 1`,
          [payload.uid],
        );
        const original = rows[0]?.original_transaction_id;
        if (!original)
          throw new DomainError('STATE_INVALID', { reason: 'no_app_store_subscription' });
        if (appStore === undefined)
          throw new DomainError('STATE_INVALID', { reason: 'store_api_unconfigured' });
        return appStore.extendRenewal(original, payload.days);
      },
    }),
  ];
}
