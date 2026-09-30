/**
 * `log_ride {ride_id, trip_id, leg_ref, provider, amount?, currency?, attendee_ids?}` (offline, the
 * "LOG IT" after a ride on 3h-3): keeps the leg in `rides` and, with an amount, splits it evenly
 * between the riders as a crew expense paid by the caller, through the money area's own writer, in
 * the same transaction. The ride id is the app's, so a replay answers the same ride and never adds
 * a second expense.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, logRidePayloadSchema, type LogRideResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { createExpense, sharesFromSplit } from '../../money/expense-writer';
import { defineCommand } from '../_framework/define-command';
import {
  localDateIn,
  requireAllInTrip,
  requireMoneyMember,
  tripDayOf,
  tripMoneyMembers,
} from '../money/shared';

const MODE = {
  grab: 'app_link',
  gojek: 'app_link',
  uber: 'app_link',
  taxi: 'street',
  transfer: 'transfer_booking',
  driver: 'guide_driver',
} as const;

const TITLE = {
  grab: 'Grab ride',
  gojek: 'Gojek ride',
  uber: 'Uber ride',
  taxi: 'Taxi',
  transfer: 'Transfer',
  driver: 'Driver',
} as const;

export const logRideCommand = defineCommand({
  name: 'log_ride',
  v: 1,
  schema: logRidePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<LogRideResult> => {
    const existing = await asSystemRole(tx, () =>
      tx.query<{ trip_id: string; logged_by: string; expense_id: string | null }>(
        'SELECT trip_id, logged_by, expense_id FROM rides WHERE id = $1',
        [payload.ride_id],
      ),
    );
    const known = existing.rows[0];
    if (known !== undefined) {
      if (known.logged_by !== ctx.uid || known.trip_id !== payload.trip_id) {
        throw new DomainError('VALIDATION', { reason: 'ride_id' });
      }
      return { ride_id: payload.ride_id, expense_id: known.expense_id };
    }
    const trip = await requireMoneyMember(tx, payload.trip_id, ctx.uid);
    const riders = payload.attendee_ids ?? [ctx.uid];
    requireAllInTrip(await tripMoneyMembers(tx, trip.id), [ctx.uid, ...riders]);
    let expenseId: string | null = null;
    if (payload.amount_minor !== undefined && payload.currency !== undefined) {
      const amountMinor = BigInt(payload.amount_minor);
      const spentAt = ctx.clock.effectiveClientTs;
      const localDate = localDateIn(trip.tz, spentAt);
      const split = { mode: 'equal' as const, shares: riders.map((user_id) => ({ user_id })) };
      const expense = await createExpense(tx, {
        id: payload.expense_id as string,
        crewId: trip.crew_id,
        tripId: trip.id,
        payerId: ctx.uid,
        amountMinor,
        currency: payload.currency,
        fxSnapshotId: payload.fx_snapshot_id ?? null,
        crewCurrency: trip.crew_currency,
        splitMode: 'equal',
        category: 'transit',
        description: TITLE[payload.provider],
        merchant: null,
        spentAt,
        localDate,
        tripDay: tripDayOf(trip.start_date, localDate),
        shares: sharesFromSplit(amountMinor, payload.currency, split, ctx.uid),
        createdBy: ctx.uid,
        source: 'ride',
        poiId: null,
        receiptId: null,
      });
      expenseId = expense.expense_id;
    }
    await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO rides (id, trip_id, leg_ref, provider, mode, quote_id, price_minor, currency,
           expense_id, attendee_ids, logged_by)
         VALUES ($1, $2, $3, $4, $5,
           (SELECT id FROM ride_quotes WHERE id = $6 AND trip_id = $2), $7, $8, $9, $10, $11)`,
        [
          payload.ride_id,
          trip.id,
          payload.leg_ref,
          payload.provider,
          payload.quote_id !== undefined ? 'grab_estimate' : MODE[payload.provider],
          payload.quote_id ?? null,
          payload.amount_minor ?? null,
          payload.currency ?? null,
          expenseId,
          riders,
          ctx.uid,
        ],
      ),
    );
    await appendDomainEvent(tx, {
      type: 'ride.logged',
      aggregateKind: 'ride',
      aggregateId: payload.ride_id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { trip_id: trip.id, ride_id: payload.ride_id, expense_id: expenseId },
    });
    return { ride_id: payload.ride_id, expense_id: expenseId };
  },
});
