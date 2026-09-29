/**
 * `move_boost` (the buyer) and `apply_boost_credit` (any member of the credit's crew, or the
 * buyer of an unassigned credit): a boost moves to another trip of the same crew that is not
 * boosted and not over; a credit is spent on one. Credits never expire and are spent once.
 */
import { DomainError, applyBoostCreditPayloadSchema, moveBoostPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { loadBoost, moveBoost, startCarriedBoost } from '../../billing/boost-lifecycle';
import { requireMoneyMember } from '../money/shared';
import { defineCommand } from '../_framework/define-command';

/** The target trip: in `crewId`, still ahead, and without a live boost. */
async function requireTarget(tx: pg.PoolClient, tripId: string, crewId: string, now: Date) {
  const { rows } = await tx.query<{ ok: boolean; crew_id: string }>(
    `SELECT t.crew_id,
            t.status NOT IN ('post_trip', 'archived', 'cancelled')
              AND (t.end_date IS NULL OR app.boost_window_end(t.id, $2) > $2)
              AND NOT EXISTS (SELECT 1 FROM trip_boosts b WHERE b.trip_id = t.id
                               AND b.status IN ('scheduled', 'active')) AS ok
       FROM trips t WHERE t.id = $1 FOR UPDATE OF t`,
    [tripId, now],
  );
  const trip = rows[0];
  if (trip === undefined || trip.crew_id !== crewId) {
    throw new DomainError('NOT_FOUND', { reason: 'trip' });
  }
  if (!trip.ok) throw new DomainError('STATE_INVALID', { reason: 'already_boosted' });
}

export const moveBoostCommand = defineCommand({
  name: 'move_boost',
  v: 1,
  schema: moveBoostPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ buyer_id: string | null }>(
      'SELECT buyer_id FROM trip_boosts WHERE id = $1',
      [payload.boost_id],
    );
    if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'boost' });
    if (rows[0].buyer_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_buyer' });
    await requireMoneyMember(tx, payload.to_trip_id, ctx.uid);
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const now = ctx.clock.serverNow;
      const boost = await loadBoost(tx, payload.boost_id);
      await requireTarget(tx, payload.to_trip_id, boost.crew_id, now);
      return moveBoost(tx, boost, payload.to_trip_id, now);
    }),
});

interface CreditRow {
  readonly id: string;
  readonly crew_id: string | null;
  readonly user_id: string | null;
  readonly from_boost_id: string | null;
  readonly consumed_at: Date | null;
  readonly revoked_at: Date | null;
}

export const applyBoostCreditCommand = defineCommand({
  name: 'apply_boost_credit',
  v: 1,
  schema: applyBoostCreditPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<CreditRow>(
      'SELECT id, crew_id, user_id, from_boost_id, consumed_at, revoked_at FROM boost_credits WHERE id = $1',
      [payload.credit_id],
    );
    if (rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'credit' });
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const now = ctx.clock.serverNow;
      const { rows } = await tx.query<CreditRow>(
        `SELECT id, crew_id, user_id, from_boost_id, consumed_at, revoked_at FROM boost_credits
          WHERE id = $1 FOR UPDATE`,
        [payload.credit_id],
      );
      const credit = rows[0];
      if (credit === undefined) throw new DomainError('NOT_FOUND', { reason: 'credit' });
      if (credit.consumed_at !== null || credit.revoked_at !== null) {
        throw new DomainError('STATE_INVALID', { reason: 'credit_used' });
      }
      const { rows: trips } = await tx.query<{ crew_id: string }>(
        'SELECT crew_id FROM trips WHERE id = $1',
        [payload.trip_id],
      );
      const crewId = trips[0]?.crew_id;
      if (crewId === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
      // A crew credit is spent in its crew; an unassigned one only by its own buyer.
      if (credit.crew_id === null ? credit.user_id !== ctx.uid : credit.crew_id !== crewId) {
        throw new DomainError('FORBIDDEN', { reason: 'credit_not_yours' });
      }
      await requireTarget(tx, payload.trip_id, crewId, now);
      const boostId = await startCarriedBoost(
        tx,
        {
          toTripId: payload.trip_id,
          crewId,
          buyerId: credit.user_id,
          fromTripId: null,
          fromBoostId: credit.from_boost_id,
        },
        now,
      );
      await tx.query(
        'UPDATE boost_credits SET consumed_by_boost_id = $2, consumed_at = $3 WHERE id = $1',
        [credit.id, boostId, now],
      );
      return { credit_id: credit.id, boost_id: boostId };
    }),
});
