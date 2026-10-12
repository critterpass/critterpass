/**
 * "By room" for a stay expense: each guest pays their room's price for the nights (shared equally
 * by the people in the room), scaled to what the stay actually cost, as exact custom shares that
 * add up to the expense (largest remainder, ties by uid). When the rooms change, the same function
 * gives the new shares, so the expense follows the room plan; balances then show who owes a top-up
 * and who gets money back.
 */
import type { PlanRoomWire, SplitShareInput } from '@cp/domain';

import { allocate } from '../money/allocate';
import { type CurrencyCode } from '../money/currencies';
import { splitStays, type PricedStay } from './split';

export interface RoomSeat {
  readonly stay_key: string;
  readonly room_key: string;
  readonly user_id: string;
}

/** Null when nobody sleeps in a priced room: there is nothing to split by. */
export function roomSplitShares(input: {
  readonly amountMinor: bigint;
  readonly currency: CurrencyCode;
  readonly rooms: readonly PlanRoomWire[];
  readonly seats: readonly RoomSeat[];
  /** Only this stay's rooms (a trip with two stays books each one apart); all stays when left out. */
  readonly stayKey?: string | null | undefined;
}): SplitShareInput[] | null {
  const stays = new Map<string, PricedStay>();
  for (const room of input.rooms) {
    if (input.stayKey != null && room.stay_key !== input.stayKey) continue;
    const occupants = input.seats
      .filter((seat) => seat.stay_key === room.stay_key && seat.room_key === room.key)
      .map((seat) => seat.user_id);
    const stay = stays.get(room.stay_key) ?? {
      key: room.stay_key,
      nights: room.stay_nights,
      currency: input.currency,
      rooms: [],
    };
    stays.set(room.stay_key, {
      ...stay,
      rooms: [
        ...stay.rooms,
        { key: room.key, nightlyMinor: BigInt(room.nightly_minor), occupants },
      ],
    });
  }
  if (stays.size === 0) return null;
  const { perGuest, total } = splitStays([...stays.values()]);
  if (total.amountMinor === 0n || perGuest.size === 0) return null;
  const guests = [...perGuest.keys()].sort();
  const shares = allocate(
    { amountMinor: input.amountMinor, currency: input.currency },
    guests.map((id) => ({ id, weight: perGuest.get(id)?.amountMinor ?? 0n })),
  );
  return shares.map((share) => ({
    user_id: share.id,
    fixed_minor: Number(share.amount.amountMinor),
  }));
}
