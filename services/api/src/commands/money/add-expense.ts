/**
 * `add_expense` (docs/api-contracts.md §4.9, offline): a trip member records what someone paid and
 * how it splits. The split members and the payer must all take part in the trip; the amount is
 * converted to the crew's settlement currency at the snapshot run the client pinned.
 */
import { addExpensePayloadSchema, type ExpenseResult } from '@cp/domain';

import { createExpense, sharesFromSplit } from '../../money/expense-writer';
import { defineCommand } from '../_framework/define-command';
import {
  localDateIn,
  requireAllInTrip,
  requireMoneyMember,
  tripDayOf,
  tripMoneyMembers,
} from './shared';

export const addExpenseCommand = defineCommand({
  name: 'add_expense',
  v: 1,
  schema: addExpensePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireMoneyMember(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<ExpenseResult> => {
    const trip = await requireMoneyMember(tx, payload.trip_id, ctx.uid);
    requireAllInTrip(await tripMoneyMembers(tx, payload.trip_id), [
      payload.payer_uid,
      ...payload.split.shares.map((share) => share.user_id),
    ]);
    const amountMinor = BigInt(payload.amount_minor);
    const spentAt =
      payload.spent_at === undefined ? ctx.clock.effectiveClientTs : new Date(payload.spent_at);
    const localDate = localDateIn(trip.tz, spentAt);
    return createExpense(tx, {
      id: payload.expense_id,
      crewId: trip.crew_id,
      tripId: trip.id,
      payerId: payload.payer_uid,
      amountMinor,
      currency: payload.currency,
      fxSnapshotId: payload.fx_snapshot_id,
      crewCurrency: trip.crew_currency,
      splitMode: payload.split.mode,
      category: payload.category,
      description: payload.description,
      merchant: payload.merchant ?? null,
      spentAt,
      localDate,
      tripDay: tripDayOf(trip.start_date, localDate),
      shares: sharesFromSplit(amountMinor, payload.currency, payload.split, payload.payer_uid),
      createdBy: ctx.uid,
      source: 'manual',
      poiId: payload.poi_id ?? null,
      receiptId: null,
    });
  },
});
