/**
 * Room packing (3c-6): fill rooms by capacity, keeping people with the same trait ("light
 * sleeper", "early bird") together, and re-pack after someone leaves so nobody is left alone in
 * a room another room could take them into. Deterministic throughout: rooms in key order, guests
 * in uid order.
 */
import { DomainError } from '@cp/domain';

import { type Money } from '../money/money';
import { stateShares, type Room, type RoomStay, type TripCostState } from '../shares/state';

export interface Guest {
  readonly uid: string;
  readonly trait?: string;
}

export interface RoomSlot {
  readonly key: string;
  readonly capacity: number;
  readonly nightlyMinor?: bigint;
  readonly label?: string;
}

const byKey = (a: { key: string }, b: { key: string }) =>
  a.key < b.key ? -1 : a.key > b.key ? 1 : 0;

/** Trait groups (largest first, then trait name; no-trait guests last) go to the roomiest room. */
export function packRooms(guests: readonly Guest[], slots: readonly RoomSlot[]): readonly Room[] {
  const capacity = slots.reduce((sum, s) => sum + s.capacity, 0);
  if (guests.length > capacity) {
    throw new DomainError('STATE_INVALID', {
      reason: 'rooms_too_small',
      guests: guests.length,
      capacity,
    });
  }
  const groups = new Map<string, string[]>();
  for (const guest of [...guests].sort((a, b) => (a.uid < b.uid ? -1 : 1))) {
    const key = guest.trait ?? '';
    groups.set(key, [...(groups.get(key) ?? []), guest.uid]);
  }
  const ordered = [...groups].sort(([ta, a], [tb, b]) => {
    if ((ta === '') !== (tb === '')) return ta === '' ? 1 : -1;
    if (a.length !== b.length) return b.length - a.length;
    return ta < tb ? -1 : 1;
  });
  const rooms = [...slots].sort(byKey).map((slot) => ({ ...slot, occupants: [] as string[] }));
  const roomiest = () =>
    rooms
      .filter((r) => r.occupants.length < r.capacity)
      .sort(
        (a, b) =>
          b.capacity - b.occupants.length - (a.capacity - a.occupants.length) || byKey(a, b),
      )[0];
  for (const [, uids] of ordered) {
    let rest = uids;
    while (rest.length > 0) {
      const target = roomiest();
      if (!target) break;
      const take = Math.min(target.capacity - target.occupants.length, rest.length);
      target.occupants.push(...rest.slice(0, take));
      rest = rest.slice(take);
    }
  }
  return rooms;
}

export interface RepackResult {
  readonly stay: RoomStay;
  readonly moves: readonly { readonly uid: string; readonly from: string; readonly to: string }[];
  readonly released: readonly {
    readonly roomKey: string;
    readonly occupantsBefore: readonly string[];
  }[];
}

/**
 * Removes `uid` from the stay. A guest left alone in a room that used to be shared moves into the
 * occupied room with the most space (then key order); rooms left empty are released.
 */
export function repackWithout(stay: RoomStay, uid: string): RepackResult {
  let rooms: Room[] = stay.rooms.map((r) => ({
    ...r,
    occupants: r.occupants.filter((o) => o !== uid),
  }));
  const moves: { uid: string; from: string; to: string }[] = [];
  for (const before of stay.rooms) {
    const now = rooms.find((r) => r.key === before.key);
    if (!now || now.occupants.length !== 1 || before.occupants.length < 2) continue;
    const loner = now.occupants[0] as string;
    const target = rooms
      .filter((r) => r.key !== now.key && r.occupants.length > 0 && r.occupants.length < r.capacity)
      .sort(
        (a, b) =>
          b.capacity - b.occupants.length - (a.capacity - a.occupants.length) || byKey(a, b),
      )[0];
    if (!target) continue;
    rooms = rooms.map((r) => {
      if (r.key === now.key) return { ...r, occupants: [] };
      if (r.key === target.key) return { ...r, occupants: [...r.occupants, loner] };
      return r;
    });
    moves.push({ uid: loner, from: now.key, to: target.key });
  }
  const released = stay.rooms
    .filter((before) => before.occupants.length > 0)
    .filter((before) => rooms.find((r) => r.key === before.key)?.occupants.length === 0)
    .map((before) => ({ roomKey: before.key, occupantsBefore: before.occupants }));
  return { stay: { ...stay, rooms }, moves, released };
}

export interface SwapDelta {
  readonly uid: string;
  readonly delta: Money;
}

/** What swapping two guests' rooms does to each share that changes. */
export function previewSwap(
  state: TripCostState,
  stayId: string,
  a: string,
  b: string,
): readonly SwapDelta[] {
  const stay = state.stays.find((s) => s.id === stayId);
  const roomOf = (uid: string) => stay?.rooms.find((r) => r.occupants.includes(uid));
  const roomA = roomOf(a);
  const roomB = roomOf(b);
  if (!stay || !roomA || !roomB)
    throw new DomainError('NOT_FOUND', { reason: 'guest_not_in_stay' });
  if (roomA.key === roomB.key) return [];
  const swapped: TripCostState = {
    ...state,
    stays: state.stays.map((s) =>
      s.id !== stayId
        ? s
        : {
            ...s,
            rooms: s.rooms.map((r) => ({
              ...r,
              occupants: r.occupants.map((o) => (o === a ? b : o === b ? a : o)),
            })),
          },
    ),
  };
  return shareDeltas(state, swapped);
}

/** Per-member share change between two states (members present in both), non-zero only. */
export function shareDeltas(before: TripCostState, after: TripCostState): readonly SwapDelta[] {
  const was = stateShares(before);
  const now = stateShares(after);
  if (was.status !== 'ok' || now.status !== 'ok') return [];
  return now.members.flatMap((member) => {
    const prior = was.members.find((m) => m.uid === member.uid);
    if (!prior || prior.totalMinor === member.totalMinor) return [];
    return [
      {
        uid: member.uid,
        delta: { amountMinor: member.totalMinor - prior.totalMinor, currency: member.currency },
      },
    ];
  });
}
