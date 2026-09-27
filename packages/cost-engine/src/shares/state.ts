/**
 * The whole priced state of a trip: members, components, and stays with their rooms. Rooms are
 * kept as rooms (not pre-split components) so a room swap, a released room or a dropout can be
 * re-priced by the same function that priced the draft.
 */
import { DomainError } from '@cp/domain';

import { type CurrencyCode } from '../money/currencies';
import { type CostComponent, type CostSource } from '../quotes/quote-set';
import { computeShares, type ShareCalc } from './allocate';
import { type FxContext } from './fx';
import { type CostMember } from './per-origin';

export interface Room {
  readonly key: string;
  readonly capacity: number;
  readonly occupants: readonly string[];
  /** Overrides the stay's nightly price for this room (a bigger room costs more). */
  readonly nightlyMinor?: bigint;
  readonly label?: string;
}

/**
 * `per_room`: each room's nightly price is split between its occupants. `per_guest`: every guest
 * pays the nightly price (ryokan-style), so moving rooms never changes a guest's price.
 */
export interface RoomStay {
  readonly id: string;
  readonly label?: string;
  readonly pricing: 'per_room' | 'per_guest';
  readonly nightlyMinor: bigint | null;
  readonly nights: number;
  readonly currency: CurrencyCode;
  readonly source: CostSource;
  readonly seenAt: string;
  readonly rooms: readonly Room[];
}

export interface TripCostState {
  readonly currency: CurrencyCode;
  readonly members: readonly CostMember[];
  readonly components: readonly CostComponent[];
  readonly stays: readonly RoomStay[];
  readonly fx?: FxContext;
  readonly now?: Date;
}

/** One component per occupied room; an empty room is released and costs nothing. */
export function roomComponents(stay: RoomStay): readonly CostComponent[] {
  return stay.rooms
    .filter((room) => room.occupants.length > 0)
    .map((room) => {
      const nightly = room.nightlyMinor ?? stay.nightlyMinor;
      return {
        id: `${stay.id}:${room.key}`,
        kind: 'stay' as const,
        unit: stay.pricing === 'per_room' ? ('room' as const) : ('person' as const),
        amountMinor: nightly === null ? null : nightly * BigInt(stay.nights),
        currency: stay.currency,
        source: stay.source,
        seenAt: stay.seenAt,
        memberIds: room.occupants,
        ...(stay.label ? { label: `${stay.label} · ${room.label ?? room.key}` } : {}),
      };
    });
}

export function stateComponents(state: TripCostState): readonly CostComponent[] {
  return [...state.components, ...state.stays.flatMap(roomComponents)];
}

export function stateShares(state: TripCostState): ShareCalc {
  return computeShares({
    currency: state.currency,
    members: state.members,
    components: stateComponents(state),
    ...(state.fx ? { fx: state.fx } : {}),
    ...(state.now ? { now: state.now } : {}),
  });
}

/** Edits a what-if applies to a state: personal options, previews and ChangeSet deltas. */
export type CostOp =
  | { readonly op: 'withdraw'; readonly componentId: string; readonly uid: string }
  | { readonly op: 'remove_component'; readonly componentId: string }
  | { readonly op: 'add_component'; readonly component: CostComponent }
  | { readonly op: 'set_amount'; readonly componentId: string; readonly amountMinor: bigint | null }
  | {
      readonly op: 'move_room';
      readonly stayId: string;
      readonly uid: string;
      readonly roomKey: string;
    };

function mustFind<T>(items: readonly T[], match: (item: T) => boolean, detail: object): T {
  const found = items.find(match);
  if (found === undefined) throw new DomainError('NOT_FOUND', detail);
  return found;
}

function applyOp(state: TripCostState, op: CostOp): TripCostState {
  switch (op.op) {
    case 'withdraw': {
      const target = mustFind(state.components, (c) => c.id === op.componentId, op);
      const payers = target.memberIds ?? state.members.map((m) => m.uid);
      const memberIds = payers.filter((uid) => uid !== op.uid);
      return {
        ...state,
        components: state.components.map((c) => (c.id === target.id ? { ...c, memberIds } : c)),
      };
    }
    case 'remove_component':
      mustFind(state.components, (c) => c.id === op.componentId, op);
      return { ...state, components: state.components.filter((c) => c.id !== op.componentId) };
    case 'add_component':
      if (state.components.some((c) => c.id === op.component.id)) {
        throw new DomainError('VALIDATION', { reason: 'duplicate_component', id: op.component.id });
      }
      return { ...state, components: [...state.components, op.component] };
    case 'set_amount':
      mustFind(state.components, (c) => c.id === op.componentId, op);
      return {
        ...state,
        components: state.components.map((c) =>
          c.id === op.componentId ? { ...c, amountMinor: op.amountMinor } : c,
        ),
      };
    case 'move_room':
      return {
        ...state,
        stays: state.stays.map((s) => (s.id === op.stayId ? moveGuest(s, op) : s)),
      };
  }
}

function moveGuest(stay: RoomStay, op: { uid: string; roomKey: string }): RoomStay {
  const target = mustFind(stay.rooms, (r) => r.key === op.roomKey, op);
  if (target.occupants.includes(op.uid)) return stay;
  if (target.occupants.length >= target.capacity) {
    throw new DomainError('STATE_INVALID', { reason: 'room_full', roomKey: op.roomKey });
  }
  return {
    ...stay,
    rooms: stay.rooms.map((room) => {
      if (room.key === op.roomKey) return { ...room, occupants: [...room.occupants, op.uid] };
      return { ...room, occupants: room.occupants.filter((uid) => uid !== op.uid) };
    }),
  };
}

export function applyCostOps(state: TripCostState, ops: readonly CostOp[]): TripCostState {
  return ops.reduce(applyOp, state);
}
