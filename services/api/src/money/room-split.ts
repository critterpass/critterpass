/**
 * A stay expense split by room (`split_mode = 'by_room'`): each guest's share comes from the trip's
 * room plan (their room's nightly price for the nights, shared inside the room, scaled to what the
 * stay cost; exact, summing to the expense). Whenever the rooms change, every live by-room expense
 * of the trip is recomputed in the same transaction as an edit by the system: the old ledger
 * entries are reversed and new ones written, so anyone who already settled up sees a top-up or a
 * refund line, and nothing already in the ledger is rewritten.
 */
import { roomSplitShares, type RoomSeat } from '@cp/cost-engine';
import { DomainError, type PlanRoomWire } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { loadExpense, updateExpense } from './expense-changes';
import { sharesFromSplit, type ShareRow } from './expense-writer';

interface RoomPlan {
  readonly rooms: readonly PlanRoomWire[];
  readonly seats: readonly RoomSeat[];
}

async function loadRoomPlan(tx: pg.PoolClient, tripId: string): Promise<RoomPlan> {
  return asSystemRole(tx, async () => {
    const plan = await tx.query<{ rooms: PlanRoomWire[] }>(
      'SELECT rooms FROM room_plans WHERE trip_id = $1',
      [tripId],
    );
    const seats = await tx.query<RoomSeat>(
      `SELECT stay_key, room_key, user_id FROM room_assignments
        WHERE trip_id = $1 ORDER BY stay_key, room_key, user_id`,
      [tripId],
    );
    return { rooms: plan.rows[0]?.rooms ?? [], seats: seats.rows };
  });
}

function sharesFromPlan(
  plan: RoomPlan,
  amountMinor: bigint,
  currency: string,
  stayKey: string | null,
  payerId: string,
): ShareRow[] | null {
  const shares = roomSplitShares({
    amountMinor,
    currency,
    rooms: plan.rooms,
    seats: plan.seats,
    stayKey,
  });
  if (shares === null) return null;
  return sharesFromSplit(amountMinor, currency, { mode: 'fixed', shares }, payerId);
}

/** The by-room shares of an amount on the trip's current room plan; no rooms is refused. */
export async function roomShares(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly amountMinor: bigint;
    readonly currency: string;
    readonly stayKey: string | null;
    readonly payerId: string;
  },
): Promise<ShareRow[]> {
  const plan = await loadRoomPlan(tx, input.tripId);
  const shares = sharesFromPlan(
    plan,
    input.amountMinor,
    input.currency,
    input.stayKey,
    input.payerId,
  );
  if (shares === null) throw new DomainError('STATE_INVALID', { reason: 'no_rooms' });
  return shares;
}

/**
 * Re-splits every live by-room expense of the trip on its current room plan. An expense whose
 * stay no longer has anyone in a priced room keeps its last split. Returns how many changed.
 */
export async function recomputeRoomExpenses(
  tx: pg.PoolClient,
  tripId: string,
  actorId: string,
): Promise<number> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ id: string }>(
      `SELECT id FROM expenses
        WHERE trip_id = $1 AND split_mode = 'by_room' AND deleted_at IS NULL
        ORDER BY id`,
      [tripId],
    ),
  );
  if (rows.length === 0) return 0;
  const plan = await loadRoomPlan(tx, tripId);
  let changed = 0;
  for (const { id } of rows) {
    const before = await loadExpense(tx, id, true);
    const shares = sharesFromPlan(
      plan,
      before.amountMinor,
      before.currency,
      before.splitStayKey ?? null,
      before.payerId,
    );
    if (shares === null) continue;
    const key = (list: readonly ShareRow[]) =>
      list
        .map((share) => `${share.userId}:${share.computedMinor}`)
        .sort()
        .join(',');
    if (key(shares) === key(before.shares)) continue;
    await updateExpense(tx, before, { ...before, shares }, actorId);
    changed += 1;
  }
  return changed;
}
