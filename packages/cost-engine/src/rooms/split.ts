/**
 * Per-person room price (3c-6): each occupied room costs its nightly price times the stay's
 * nights, split equally between the people in it by largest remainder, so a bigger or pricier
 * room costs its occupants more and every stay's shares add back to what its rooms cost. An empty
 * room is released and costs nobody anything.
 */
import { DomainError } from '@cp/domain';

import { allocate } from '../money/allocate';
import { type CurrencyCode } from '../money/currencies';
import { type Money } from '../money/money';

export interface PricedRoom {
  readonly key: string;
  readonly nightlyMinor: bigint;
  readonly occupants: readonly string[];
}

export interface PricedStay {
  readonly key: string;
  readonly nights: number;
  readonly currency: CurrencyCode;
  readonly rooms: readonly PricedRoom[];
}

export interface RoomSplit {
  /** What each guest pays for this stay (or for every stay, in `splitStays`). */
  readonly perGuest: ReadonlyMap<string, Money>;
  /** What the occupied rooms cost together. */
  readonly total: Money;
}

export function splitStay(stay: PricedStay): RoomSplit {
  if (!Number.isInteger(stay.nights) || stay.nights < 0) {
    throw new DomainError('VALIDATION', { reason: 'nights', nights: stay.nights });
  }
  const perGuest = new Map<string, Money>();
  let total = 0n;
  for (const room of stay.rooms) {
    if (room.nightlyMinor < 0n) throw new DomainError('VALIDATION', { reason: 'negative_price' });
    if (room.occupants.length === 0) continue;
    const roomTotal = room.nightlyMinor * BigInt(stay.nights);
    total += roomTotal;
    const shares = allocate(
      { amountMinor: roomTotal, currency: stay.currency },
      [...new Set(room.occupants)].sort().map((uid) => ({ id: uid, weight: 1n })),
    );
    for (const share of shares) {
      const before = perGuest.get(share.id)?.amountMinor ?? 0n;
      perGuest.set(share.id, {
        amountMinor: before + share.amount.amountMinor,
        currency: stay.currency,
      });
    }
  }
  return { perGuest, total: { amountMinor: total, currency: stay.currency } };
}

/** Every stay of the trip added up per guest (all stays in one currency). */
export function splitStays(stays: readonly PricedStay[]): RoomSplit {
  const currency = stays[0]?.currency;
  if (currency === undefined) throw new DomainError('VALIDATION', { reason: 'no_stays' });
  if (stays.some((stay) => stay.currency !== currency)) {
    throw new DomainError('VALIDATION', { reason: 'currency_mismatch' });
  }
  const perGuest = new Map<string, Money>();
  let total = 0n;
  for (const stay of stays) {
    const split = splitStay(stay);
    total += split.total.amountMinor;
    for (const [uid, amount] of split.perGuest) {
      const before = perGuest.get(uid)?.amountMinor ?? 0n;
      perGuest.set(uid, { amountMinor: before + amount.amountMinor, currency });
    }
  }
  return { perGuest, total: { amountMinor: total, currency } };
}
