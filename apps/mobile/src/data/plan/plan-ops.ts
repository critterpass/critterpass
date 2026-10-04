/**
 * Plan edits as ops. Every edit on the day view or the timeline is built here as absolute-value
 * plan ops keyed by `stable_id` (a new start and end, a target day), so an organiser's edit goes
 * out as `apply_plan_ops` unchanged and a member's edit is the same change wrapped as change set
 * ops, with the before and after snapshots the review screen diffs and the people it touches.
 */
import {
  generateStableId,
  type ChangeSetOp,
  type PlanItemSnapshot,
  type PlanOp,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';

import { instantOnDay, type DayItem } from './plan-model';

export interface DaySlot {
  readonly date: string;
  readonly dayNo: number;
}

/** Moves `item` to start at `start` (same length), optionally into another lane. */
export function moveOp(
  item: DayItem,
  day: DaySlot,
  start: number,
  lane?: string | null,
): PlanOp | null {
  if (item.start === null || item.end === null) return null;
  const length = item.end - item.start;
  return {
    op: 'move',
    item: item.stableId,
    new: {
      starts_at: instantOnDay(day.date, start, item.tz),
      ends_at: instantOnDay(day.date, start + length, item.tz),
      ...(lane === undefined ? {} : { lane }),
    },
  };
}

export function resizeOp(item: DayItem, day: DaySlot, start: number, end: number): PlanOp {
  return {
    op: 'resize',
    item: item.stableId,
    new: {
      starts_at: instantOnDay(day.date, start, item.tz),
      ends_at: instantOnDay(day.date, end, item.tz),
    },
  };
}

/** Moves `item` to another day, keeping its local times. */
export function moveToDayOp(item: DayItem, to: DaySlot): PlanOp {
  const times =
    item.start === null || item.end === null
      ? {}
      : {
          starts_at: instantOnDay(to.date, item.start, item.tz),
          ends_at: instantOnDay(to.date, item.end, item.tz),
        };
  return { op: 'move', item: item.stableId, new: { day_no: to.dayNo, ...times } };
}

export function removeOp(item: DayItem): PlanOp {
  return { op: 'remove', item: item.stableId };
}

export interface NewItem {
  readonly title: string | null;
  readonly poiId: string | null;
  readonly category: string | null;
  readonly start: number;
  readonly end: number;
  readonly tz: string;
}

/** A new item on `day`; a freeform item keeps its name in `notes`. */
export function addOp(day: DaySlot, item: NewItem, stableId = generateStableId()): PlanOp {
  return {
    op: 'add',
    item: stableId,
    new: {
      day_no: day.dayNo,
      starts_at: instantOnDay(day.date, item.start, item.tz),
      ends_at: instantOnDay(day.date, item.end, item.tz),
      tz: item.tz,
      status: 'confirmed',
      ...(item.poiId === null ? {} : { poi_id: item.poiId }),
      ...(item.category === null ? {} : { category: item.category }),
      ...(item.poiId === null && item.title !== null ? { notes: item.title } : {}),
    },
  };
}

function snapshot(item: PlanStateItem): PlanItemSnapshot {
  const fields: PlanItemSnapshot = {
    day_no: item.day_no,
    ...(item.starts_at === undefined ? {} : { starts_at: item.starts_at }),
    ...(item.ends_at === undefined ? {} : { ends_at: item.ends_at }),
    ...(item.lane === undefined || item.lane === null ? {} : { lane: item.lane }),
  };
  return fields;
}

export interface ChangeReasons {
  readonly moved: string;
  readonly added: string;
  readonly removed: string;
}

/**
 * A member's plan ops as change set ops against `state`: who they touch (the item's people, or
 * everyone when the item is the whole crew's) and whether a booking is involved.
 */
export function toChangeSetOps(
  ops: readonly PlanOp[],
  state: PlanState,
  crew: readonly string[],
  reasons: ChangeReasons,
): ChangeSetOp[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const people = (item: PlanStateItem | undefined) =>
    item?.attendee_ids !== undefined && item.attendee_ids.length > 0
      ? [...item.attendee_ids]
      : [...crew];
  return ops.flatMap((op): ChangeSetOp[] => {
    if (op.op === 'reorder_days') return [];
    if (op.op === 'add') {
      const { day_no, ...rest } = op.new;
      return [
        {
          op: 'add',
          target: op.item,
          after: { ...rest, day_no },
          reason: reasons.added,
          affected_user_ids: [...crew],
          booking_impact: false,
        },
      ];
    }
    const item = byId.get(op.item);
    const booked = item?.booking_id !== undefined && item.booking_id !== null;
    if (op.op === 'remove') {
      return [
        {
          op: 'remove',
          target: op.item,
          ...(item === undefined ? {} : { before: snapshot(item) }),
          reason: reasons.removed,
          affected_user_ids: people(item),
          booking_impact: booked,
        },
      ];
    }
    const next = op.new as PlanItemSnapshot & { lane?: string | null };
    const { lane, ...rest } = next;
    const dayChanged = next.day_no !== undefined && next.day_no !== item?.day_no;
    return [
      {
        op: dayChanged ? 'move' : 'retime',
        target: op.item,
        ...(item === undefined ? {} : { before: snapshot(item) }),
        after: { ...rest, ...(lane === undefined || lane === null ? {} : { lane }) },
        reason: reasons.moved,
        affected_user_ids: people(item),
        booking_impact: booked,
      },
    ];
  });
}

/** Stable ids the ops touch (for the queued badge and the conflict toast). */
export function opTargets(ops: readonly PlanOp[]): string[] {
  return ops.flatMap((op) => (op.op === 'reorder_days' ? [] : [op.item]));
}
