/**
 * Dropout re-split (3f-7): take a member out and re-price everyone else. Rooms re-pack (a guest
 * left alone joins another room, the empty room is released), shared components re-split over the
 * people still going, and the leaver's own entries are withdrawn. Returns before/after per member
 * ("$1,310 → $1,334, +$24 each") and the change list a ChangeSet is built from.
 */
import { DomainError } from '@cp/domain';

import { displayDelta } from '../display/round';
import { type Money } from '../money/money';
import { repackWithout } from '../rooms/pack';
import { applicableMembers, resolveOrigins } from '../shares/per-origin';
import { stateShares, type TripCostState } from '../shares/state';

export type DropoutChange =
  | {
      readonly kind: 'room_released';
      readonly stayId: string;
      readonly roomKey: string;
      readonly occupantsBefore: readonly string[];
    }
  | {
      readonly kind: 'guest_moved';
      readonly stayId: string;
      readonly uid: string;
      readonly fromRoom: string;
      readonly toRoom: string;
    }
  | {
      readonly kind: 'split_changed';
      readonly componentId: string;
      readonly ways: { readonly before: number; readonly after: number };
    }
  | { readonly kind: 'entry_withdrawn'; readonly componentId: string; readonly uid: string };

export interface MemberResplit {
  readonly uid: string;
  readonly before: Money;
  readonly after: Money;
  readonly delta: Money;
  /** Delta between the rounded labels ("+$24 each"). */
  readonly displayDelta: Money;
}

export interface DropoutResult {
  readonly state: TripCostState;
  readonly members: readonly MemberResplit[];
  readonly changes: readonly DropoutChange[];
}

/** Per-head estimates are not entries anyone would "withdraw". */
const NOT_ENTRIES = new Set(['food', 'fun']);

export function dropout(state: TripCostState, uid: string): DropoutResult {
  if (!state.members.some((m) => m.uid === uid)) {
    throw new DomainError('NOT_FOUND', { reason: 'member_not_in_trip' });
  }
  if (state.members.length === 1) {
    throw new DomainError('STATE_INVALID', { reason: 'last_member_cannot_drop_out' });
  }
  const changes: DropoutChange[] = [];
  const stays = state.stays.map((stay) => {
    const result = repackWithout(stay, uid);
    for (const move of result.moves) {
      changes.push({
        kind: 'guest_moved',
        stayId: stay.id,
        uid: move.uid,
        fromRoom: move.from,
        toRoom: move.to,
      });
    }
    for (const room of result.released) {
      changes.push({ kind: 'room_released', stayId: stay.id, ...room });
    }
    return result.stay;
  });

  const resolvedBefore = resolveOrigins(state.members);
  const remaining = state.members.filter((m) => m.uid !== uid);
  const resolvedAfter = resolveOrigins(remaining);
  const components = state.components.map((component) => {
    const payersBefore = applicableMembers(component, resolvedBefore);
    if (!payersBefore.some((p) => p.uid === uid)) return component;
    if (component.unit === 'person') {
      if (!NOT_ENTRIES.has(component.kind)) {
        changes.push({ kind: 'entry_withdrawn', componentId: component.id, uid });
      }
    } else {
      const after = applicableMembers(component, resolvedAfter).length;
      changes.push({
        kind: 'split_changed',
        componentId: component.id,
        ways: { before: payersBefore.length, after },
      });
    }
    return component.memberIds
      ? { ...component, memberIds: component.memberIds.filter((m) => m !== uid) }
      : component;
  });

  const next: TripCostState = { ...state, members: remaining, components, stays };
  const was = stateShares(state);
  const now = stateShares(next);
  const members =
    was.status === 'ok' && now.status === 'ok'
      ? now.members.map((member) => {
          const prior = was.members.find((m) => m.uid === member.uid);
          const before = { amountMinor: prior?.totalMinor ?? 0n, currency: member.currency };
          const after = { amountMinor: member.totalMinor, currency: member.currency };
          return {
            uid: member.uid,
            before,
            after,
            delta: {
              amountMinor: after.amountMinor - before.amountMinor,
              currency: after.currency,
            },
            displayDelta: displayDelta(before, after),
          };
        })
      : [];
  return { state: next, members, changes };
}
