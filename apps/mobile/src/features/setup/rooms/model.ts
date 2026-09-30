/**
 * The rooms plan as the step shows it, built from synced rows (`room_plans`, `room_assignments`)
 * with this phone's queued moves laid on top, so a move shows at once and survives going offline.
 * Pure: moving someone, the capacity check, the command payload and the per-person price (each
 * room's nights × nightly price split between the people in it, via the cost engine) are all
 * computed here.
 */
/* eslint-disable lingui/no-unlocalized-strings -- trait keys, wire values and date parsing, never copy. */
import { splitStays, type PricedStay } from '@cp/cost-engine';
import type { PlanRoomWire } from '@cp/domain';

export type TraitLabel = 'light_sleepers' | 'early_risers' | 'night_owls' | 'couple';

export interface PlanRoom {
  readonly key: string;
  readonly capacity: number;
  readonly nightlyMinor: number;
  readonly trait: TraitLabel | null;
  readonly occupants: readonly string[];
}

export interface PlanStay {
  readonly key: string;
  readonly type: string;
  readonly nights: number;
  readonly rooms: readonly PlanRoom[];
}

export interface RoomsPlan {
  readonly version: number;
  readonly currency: string;
  readonly stayOptionId: string;
  readonly stays: readonly PlanStay[];
  readonly samePairsAllStays: boolean;
  readonly locked: boolean;
  readonly bookingId: string | null;
  readonly freeCancelUntil: string | null;
}

export interface PlanRow {
  readonly stay_option_id: string;
  readonly rooms: string | null;
  readonly currency: string;
  readonly version: number;
  readonly same_pairs_all_stays: number | null;
  readonly locked_at: string | null;
  readonly stay_booking_id: string | null;
  readonly free_cancel_until: string | null;
}

export interface AssignmentRow {
  readonly stay_key: string;
  readonly room_key: string;
  readonly user_id: string;
  readonly trait_label: string | null;
}

/** A queued `set_room_assignment`'s rooms (this phone's moves not yet synced back). */
export interface PendingRooms {
  readonly rooms: readonly { stay_key: string; room_key: string; uids: readonly string[] }[];
  readonly same_pairs_all_stays?: boolean;
}

const TRAITS: readonly string[] = ['light_sleepers', 'early_risers', 'night_owls', 'couple'];

function parseRooms(value: string | null): PlanRoomWire[] {
  if (value === null) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PlanRoomWire[]) : [];
  } catch {
    return [];
  }
}

function withPending(
  stays: PlanStay[],
  pending: readonly PendingRooms[],
  samePairs: boolean,
): { stays: PlanStay[]; samePairs: boolean } {
  let same = samePairs;
  let current = stays;
  for (const change of pending) {
    same = change.same_pairs_all_stays ?? same;
    const edited = new Set(change.rooms.map((room) => room.stay_key));
    const source = [...edited][0];
    current = current.map((stay) => {
      const from = edited.has(stay.key) ? stay.key : same ? source : undefined;
      if (from === undefined) return stay;
      return {
        ...stay,
        rooms: stay.rooms.map((room) => {
          const moved = change.rooms.find((r) => r.stay_key === from && r.room_key === room.key);
          // A manual move clears the guide's grouping label, as the server does.
          return moved === undefined ? room : { ...room, occupants: moved.uids, trait: null };
        }),
      };
    });
  }
  return { stays: current, samePairs: same };
}

export function buildPlan(
  row: PlanRow | undefined,
  assignments: readonly AssignmentRow[],
  pending: readonly PendingRooms[],
): RoomsPlan | null {
  if (row === undefined) return null;
  const stays: PlanStay[] = [];
  for (const wire of parseRooms(row.rooms)) {
    let stay = stays.find((candidate) => candidate.key === wire.stay_key);
    if (stay === undefined) {
      stay = { key: wire.stay_key, type: wire.stay_type, nights: wire.stay_nights, rooms: [] };
      stays.push(stay);
    }
    const inRoom = assignments.filter(
      (a) => a.stay_key === wire.stay_key && a.room_key === wire.key,
    );
    const trait = inRoom.find((a) => a.trait_label !== null)?.trait_label ?? null;
    (stay.rooms as PlanRoom[]).push({
      key: wire.key,
      capacity: wire.capacity,
      nightlyMinor: wire.nightly_minor,
      trait: trait !== null && TRAITS.includes(trait) ? (trait as TraitLabel) : null,
      occupants: inRoom.map((a) => a.user_id),
    });
  }
  const merged = withPending(stays, pending, row.same_pairs_all_stays === 1);
  return {
    version: row.version + pending.length,
    currency: row.currency,
    stayOptionId: row.stay_option_id,
    stays: merged.stays,
    samePairsAllStays: merged.samePairs,
    locked: row.locked_at !== null,
    bookingId: row.stay_booking_id,
    freeCancelUntil: row.free_cancel_until,
  };
}

export type MoveResult =
  | { readonly kind: 'moved'; readonly stay: PlanStay }
  | { readonly kind: 'full' }
  | { readonly kind: 'same' };

/** Moves `uid` into `roomKey` of `stay`; a full room takes nobody (no swap without a free bed). */
export function moveGuest(stay: PlanStay, uid: string, roomKey: string): MoveResult {
  const target = stay.rooms.find((room) => room.key === roomKey);
  if (target === undefined || target.occupants.includes(uid)) return { kind: 'same' };
  if (target.occupants.length >= target.capacity) return { kind: 'full' };
  return {
    kind: 'moved',
    stay: {
      ...stay,
      rooms: stay.rooms.map((room) => ({
        ...room,
        occupants:
          room.key === roomKey
            ? [...room.occupants, uid]
            : room.occupants.filter((occupant) => occupant !== uid),
      })),
    },
  };
}

/** `set_room_assignment` rooms for one stay. */
export function roomsPayload(stay: PlanStay) {
  return stay.rooms.map((room) => ({
    stay_key: stay.key,
    room_key: room.key,
    uids: [...room.occupants],
  }));
}

/** Everyone taking part who has no bed in `stay` (joined after the rooms were made). */
export function unplaced(stay: PlanStay, members: readonly string[]): string[] {
  const placed = new Set(stay.rooms.flatMap((room) => room.occupants));
  return members.filter((uid) => !placed.has(uid));
}

export interface PerPerson {
  /** Whole major units, lowest and highest share (equal when every room splits the same). */
  readonly low: number;
  readonly high: number;
  readonly mine: number | null;
}

/** Per-person price across every stay, in whole units of the plan's currency. */
export function perPersonPrice(
  plan: RoomsPlan,
  me: string,
  fractionDigits: number,
): PerPerson | null {
  const stays: PricedStay[] = plan.stays.map((stay) => ({
    key: stay.key,
    nights: stay.nights,
    currency: plan.currency,
    rooms: stay.rooms.map((room) => ({
      key: room.key,
      nightlyMinor: BigInt(room.nightlyMinor),
      occupants: room.occupants,
    })),
  }));
  if (stays.length === 0) return null;
  const split = splitStays(stays);
  const scale = 10 ** fractionDigits;
  const shares = [...split.perGuest.values()].map((money) => Number(money.amountMinor) / scale);
  if (shares.length === 0) return null;
  const mine = split.perGuest.get(me);
  return {
    low: Math.round(Math.min(...shares)),
    high: Math.round(Math.max(...shares)),
    mine: mine === undefined ? null : Math.round(Number(mine.amountMinor) / scale),
  };
}

/** The guide's groupings in the first stay, in room order, each once. */
export function traitsOf(plan: RoomsPlan): TraitLabel[] {
  const seen: TraitLabel[] = [];
  for (const room of plan.stays[0]?.rooms ?? []) {
    if (room.trait !== null && !seen.includes(room.trait)) seen.push(room.trait);
  }
  return seen;
}

/** The nth stay's first and last night (`YYYY-MM-DD`) from the trip's start date. */
export function stayDates(
  plan: RoomsPlan,
  index: number,
  tripStart: string | null,
): { from: string; to: string } | null {
  if (tripStart === null) return null;
  const offset = plan.stays.slice(0, index).reduce((sum, stay) => sum + stay.nights, 0);
  const stay = plan.stays[index];
  if (stay === undefined) return null;
  const day = (n: number) =>
    new Date(Date.parse(`${tripStart}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  return { from: day(offset), to: day(offset + stay.nights) };
}
