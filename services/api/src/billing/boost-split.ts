/**
 * A split boost becomes an expense paid by the buyer with one `boost_iou` ledger entry per member
 * who owes them (docs/data-model.md §3.8: IOUs only, no money moves in the app, and an IOU never
 * gates a perk). Shares come from the boost split rule: every other member owes the same floored
 * share of the price the store actually charged, and the buyer absorbs the remainder, so the
 * shares always sum to the charged price exactly. Converted to the crew's settlement currency at
 * the latest FX run when the store charged in another currency.
 */
import { money, splitBoost, type LedgerEntryDraft } from '@cp/cost-engine';
import { emitEvent } from '@cp/db';
import { DomainError, generateUuidV7, MONEY_RT } from '@cp/domain';
import type pg from 'pg';

import { localDateIn, publishMoney, tripDayOf } from '../commands/money/shared';
import { price, snapshot, writeShares, type ExpenseFields } from '../money/expense-writer';
import { writeLedgerEntries } from '../money/ledger';
import { reissueStaleRequests } from '../money/settle';

export interface BoostForSplit {
  /** The trip boost it pays for; null for a crew yearly purchase (its grant keeps the expense). */
  readonly id: string | null;
  readonly tripId: string;
  readonly crewId: string;
  readonly buyerId: string;
  readonly memberIds: readonly string[];
}

export interface ChargedPrice {
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly purchasedAt: Date;
}

/** The members of a split still seated on the trip (RSVP not out, still in the crew). */
export async function seatedAmong(
  tx: pg.PoolClient,
  tripId: string,
  memberIds: readonly string[],
): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT tp.user_id FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       JOIN crew_members m ON m.crew_id = t.crew_id AND m.user_id = tp.user_id AND m.status = 'active'
      WHERE tp.trip_id = $1 AND tp.rsvp <> 'out' AND tp.user_id = ANY ($2::uuid[])`,
    [tripId, [...memberIds]],
  );
  const seated = new Set(rows.map((row) => row.user_id));
  return memberIds.filter((uid) => seated.has(uid));
}

/**
 * Writes the split for `boost` (must run as the server). Returns the expense id, or `null` when
 * nobody but the buyer is left to owe anything. Throws `VALIDATION fx_rate_missing` when the charge
 * cannot be converted yet; the boost stays active and the split is retried later.
 */
export async function writeBoostSplit(
  tx: pg.PoolClient,
  boost: BoostForSplit,
  charged: ChargedPrice,
): Promise<string | null> {
  const members = await seatedAmong(tx, boost.tripId, boost.memberIds);
  if (!members.includes(boost.buyerId)) members.unshift(boost.buyerId);
  if (members.length < 2) return null;
  const split = splitBoost(money(charged.amountMinor, charged.currency), boost.buyerId, members);
  const owed = new Map(split.ious.map((iou) => [iou.debtorUid, iou.amount.amountMinor]));
  const { rows: trips } = await tx.query<{
    crew_currency: string;
    tz: string | null;
    start_date: string | null;
  }>(
    `SELECT coalesce(c.settlement_currency, 'USD') AS crew_currency, coalesce(t.tz, d.tz) AS tz,
            t.start_date::text AS start_date
       FROM trips t JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [boost.tripId],
  );
  const trip = trips[0];
  if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  const localDate = localDateIn(trip.tz, charged.purchasedAt);
  const expenseId = generateUuidV7();
  const fields: ExpenseFields = {
    id: expenseId,
    crewId: boost.crewId,
    tripId: boost.tripId,
    payerId: boost.buyerId,
    amountMinor: charged.amountMinor,
    currency: charged.currency,
    fxSnapshotId: null,
    crewCurrency: trip.crew_currency,
    splitMode: 'fixed',
    category: 'other',
    description: 'Trip Boost',
    merchant: null,
    spentAt: charged.purchasedAt,
    localDate,
    tripDay: tripDayOf(trip.start_date, localDate),
    shares: members.map((uid) => {
      const share = uid === boost.buyerId ? split.buyerShare.amountMinor : (owed.get(uid) ?? 0n);
      return { userId: uid, weight: 1, fixedMinor: share, computedMinor: share };
    }),
  };
  const priced = await price(tx, fields);
  await tx.query(
    `INSERT INTO expenses (id, crew_id, trip_id, payer_id, amount_minor, currency, fx_snapshot_id,
       crew_amount_minor, crew_currency, split_mode, category, description, local_date, trip_day,
       spent_at, boost_id, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'fixed', 'other', $10, $11, $12, $13, $14, 'boost',
       $4)`,
    [
      expenseId,
      boost.crewId,
      boost.tripId,
      boost.buyerId,
      charged.amountMinor.toString(),
      charged.currency,
      priced.fxSnapshotId,
      priced.crewAmountMinor.toString(),
      trip.crew_currency,
      fields.description,
      localDate,
      fields.tripDay,
      charged.purchasedAt,
      boost.id,
    ],
  );
  await writeShares(tx, fields, priced);
  await tx.query(
    `INSERT INTO expense_edits (expense_id, trip_id, editor_id, kind, after)
     VALUES ($1, $2, $3, 'created', $4)`,
    [expenseId, boost.tripId, boost.buyerId, JSON.stringify(snapshot(fields, priced))],
  );
  const entries: LedgerEntryDraft[] = priced.crewShares
    .filter((share) => share.userId !== boost.buyerId && share.amountMinor > 0n)
    .map((share) => ({
      crewId: boost.crewId,
      tripId: boost.tripId,
      debtorId: share.userId,
      creditorId: boost.buyerId,
      amountMinor: share.amountMinor,
      currency: trip.crew_currency,
      sourceKind: 'boost_iou',
      sourceId: expenseId,
      reversesId: null,
    }));
  await writeLedgerEntries(tx, entries);
  if (boost.id !== null) {
    await tx.query('UPDATE trip_boosts SET expense_id = $2 WHERE id = $1', [boost.id, expenseId]);
  }
  await publishMoney(tx, boost.crewId, MONEY_RT.expenseAdded, {
    expense_id: expenseId,
    trip_id: boost.tripId,
  });
  await publishMoney(tx, boost.crewId, MONEY_RT.balancesUpdated, { crew_id: boost.crewId });
  const ids = { trip_id: boost.tripId, crew_id: boost.crewId };
  await emitEvent(tx, {
    type: 'expense.added',
    aggregateKind: 'expense',
    aggregateId: expenseId,
    actorKind: 'system',
    actorId: null,
    crewId: boost.crewId,
    tripId: boost.tripId,
    payload: { ...ids, expense_id: expenseId, payer_id: boost.buyerId, source: 'boost' },
  });
  if (boost.id !== null) {
    await emitEvent(tx, {
      type: 'boost.split_added',
      aggregateKind: 'trip_boost',
      aggregateId: boost.id,
      actorKind: 'system',
      actorId: null,
      crewId: boost.crewId,
      tripId: boost.tripId,
      payload: { ...ids, boost_id: boost.id, expense_id: expenseId },
    });
  }
  await reissueStaleRequests(tx, boost.crewId, boost.tripId, trip.crew_currency);
  return expenseId;
}
