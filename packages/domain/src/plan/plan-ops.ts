/**
 * Direct plan edits (`apply_plan_ops`, docs/api-contracts.md §4.6) and the one pure function every
 * side replays them with. A plan op is what an organiser's drag, resize, add, remove or day reorder
 * commits; a ChangeSet op (./change-set-ops.ts) is what a proposal carries. Both lower to the same
 * `PlanEdit`s, so the server's new version, the client's optimistic plan, the planner's rebase and
 * the personal overlay all agree on what an op does. Ops are keyed by `stable_id` and carry absolute
 * values (a new start time, a target day number), never deltas: two ops on different items commute.
 */
import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

import type { LockedReason } from '../itinerary/schemas';
import type { ChangeSetOp } from './change-set-ops';
import { planItemSnapshotSchema, type PlanItemSnapshot } from './plan-item';

export const PLAN_OP_KINDS = ['move', 'resize', 'add', 'remove', 'reorder_days'] as const;
export type PlanOpKind = (typeof PLAN_OP_KINDS)[number];

const instant = z.iso.datetime({ offset: true });
const dayNo = z.number().int().min(1).max(366);

export const planOpSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('move'),
    item: z.uuid(),
    new: z.object({
      day_no: dayNo.optional(),
      starts_at: instant.optional(),
      ends_at: instant.optional(),
      lane: z.string().min(1).max(40).nullable().optional(),
    }),
  }),
  z.object({
    op: z.literal('resize'),
    item: z.uuid(),
    new: z.object({ starts_at: instant.optional(), ends_at: instant.optional() }),
  }),
  z.object({
    op: z.literal('add'),
    /** The client-chosen `stable_id` of the new item. */
    item: z.uuid(),
    new: planItemSnapshotSchema.extend({ day_no: dayNo }),
  }),
  z.object({ op: z.literal('remove'), item: z.uuid() }),
  z.object({
    op: z.literal('reorder_days'),
    /** Every current day number, in its new order: position k takes day k's date. */
    new: z.object({ order: z.array(dayNo).min(1).max(366) }),
  }),
]);
export type PlanOp = z.infer<typeof planOpSchema>;

export const planOpsSchema = z.array(planOpSchema).min(1).max(50);

export const applyPlanOpsPayloadSchema = z.object({
  trip_id: z.uuid(),
  /** The `itinerary_versions.id` the ops were made against (the trip's current version). */
  base_version: z.uuid(),
  ops: planOpsSchema,
  /** The organiser saw the "this item is booked / a must-do" warning and went ahead. */
  confirm_locked: z.boolean().default(false),
});
export type ApplyPlanOpsPayload = z.infer<typeof applyPlanOpsPayloadSchema>;

/** The same edits on the organiser's private draft: `base_version` is the trip's draft. */
export const applyDraftOpsPayloadSchema = applyPlanOpsPayloadSchema;
export type ApplyDraftOpsPayload = ApplyPlanOpsPayload;

export interface PlanStateDay {
  readonly day_no: number;
  /** Local calendar date (`YYYY-MM-DD`); null while the trip's dates are open. */
  readonly date: string | null;
  readonly theme: string | null;
}

export type PlanStateItem = Omit<PlanItemSnapshot, 'lane'> & {
  readonly stable_id: string;
  /** Parallel lane in the timeline; null = the day's main lane. */
  readonly lane?: string | null | undefined;
  readonly day_no: number;
  readonly locked_reason?: LockedReason | null | undefined;
  readonly created_by_kind?: 'user' | 'guide' | undefined;
};

export interface PlanState {
  readonly days: readonly PlanStateDay[];
  readonly items: readonly PlanStateItem[];
}

/** One normalised edit; plan ops and ChangeSet ops both lower to these. */
export type PlanEdit =
  | { readonly kind: 'patch'; readonly stableId: string; readonly patch: Partial<PlanStateItem> }
  | { readonly kind: 'add'; readonly item: PlanStateItem }
  | { readonly kind: 'remove'; readonly stableId: string }
  | { readonly kind: 'reorder_days'; readonly order: readonly number[] };

export const PLAN_EDIT_ERROR_REASONS = [
  'unknown_item',
  'duplicate_item',
  'unknown_day',
  'bad_order',
  'bad_times',
] as const;
export type PlanEditErrorReason = (typeof PLAN_EDIT_ERROR_REASONS)[number];

export class PlanEditError extends Error {
  constructor(
    readonly reason: PlanEditErrorReason,
    readonly target: string | null,
  ) {
    super(`plan edit rejected: ${reason}${target === null ? '' : ` (${target})`}`);
    this.name = 'PlanEditError';
  }
}

type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

function defined<T extends object>(value: T): Defined<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Defined<T>;
}

export function planOpsToEdits(ops: readonly PlanOp[]): PlanEdit[] {
  return ops.map((op): PlanEdit => {
    switch (op.op) {
      case 'move':
      case 'resize':
        return { kind: 'patch', stableId: op.item, patch: defined(op.new) };
      case 'add':
        return {
          kind: 'add',
          item: { ...defined(op.new), day_no: op.new.day_no, stable_id: op.item },
        };
      case 'remove':
        return { kind: 'remove', stableId: op.item };
      case 'reorder_days':
        return { kind: 'reorder_days', order: op.new.order };
    }
  });
}

/** ChangeSet ops the reviewer left on (`accepted !== false`), as edits. */
export function changeSetOpsToEdits(ops: readonly ChangeSetOp[]): PlanEdit[] {
  return ops
    .filter((op) => op.accepted !== false)
    .map((op): PlanEdit => {
      if (op.op === 'remove') return { kind: 'remove', stableId: op.target };
      const after = defined(op.after ?? {});
      if (op.op === 'add') {
        return {
          kind: 'add',
          item: { ...after, day_no: after.day_no ?? 1, stable_id: op.target },
        };
      }
      return { kind: 'patch', stableId: op.target, patch: after };
    });
}

/** The stable ids (and `days` for a reorder) an edit list touches. */
export function editTargets(edits: readonly PlanEdit[]): Set<string> {
  const keys = new Set<string>();
  for (const edit of edits) {
    if (edit.kind === 'reorder_days') keys.add('days');
    else keys.add(edit.kind === 'add' ? edit.item.stable_id : edit.stableId);
  }
  return keys;
}

function shiftDate(at: string | undefined, tz: string, days: number): string | undefined {
  if (at === undefined || days === 0) return at;
  return Temporal.Instant.from(at).toZonedDateTimeISO(tz).add({ days }).toInstant().toString();
}

function dateDelta(from: string | null, to: string | null): number {
  if (from === null || to === null) return 0;
  return Temporal.PlainDate.from(from).until(Temporal.PlainDate.from(to), { largestUnit: 'day' })
    .days;
}

function reorder(state: PlanState, order: readonly number[]): PlanState {
  const days = [...state.days].sort((a, b) => a.day_no - b.day_no);
  const current = days.map((day) => day.day_no);
  const sorted = [...order].sort((a, b) => a - b);
  if (sorted.length !== current.length || sorted.some((n, i) => n !== current[i])) {
    throw new PlanEditError('bad_order', null);
  }
  // Position k keeps its own date; it takes the theme and items of day `order[k]`.
  const target = new Map<number, PlanStateDay>();
  order.forEach((from, index) => {
    const slot = days[index];
    if (slot !== undefined) target.set(from, slot);
  });
  const byNo = new Map(days.map((day) => [day.day_no, day]));
  return {
    days: days.map((slot, index) => {
      const source = byNo.get(order[index] ?? slot.day_no) ?? slot;
      return { ...slot, theme: source.theme };
    }),
    items: state.items.map((item) => {
      const slot = target.get(item.day_no);
      const from = byNo.get(item.day_no);
      if (slot === undefined || from === undefined) return item;
      const delta = dateDelta(from.date, slot.date);
      const tz = item.tz ?? 'UTC';
      const moved: PlanStateItem = { ...item, day_no: slot.day_no };
      const startsAt = shiftDate(item.starts_at, tz, delta);
      const endsAt = shiftDate(item.ends_at, tz, delta);
      return {
        ...moved,
        ...(startsAt === undefined ? {} : { starts_at: startsAt }),
        ...(endsAt === undefined ? {} : { ends_at: endsAt }),
      };
    }),
  };
}

function checkItem(item: PlanStateItem, dayNos: ReadonlySet<number>): void {
  if (!dayNos.has(item.day_no)) throw new PlanEditError('unknown_day', item.stable_id);
  if (
    item.starts_at !== undefined &&
    item.ends_at !== undefined &&
    Date.parse(item.ends_at) < Date.parse(item.starts_at)
  ) {
    throw new PlanEditError('bad_times', item.stable_id);
  }
}

/** Applies edits in order; throws `PlanEditError` for an edit the state cannot take. */
export function applyPlanEdits(state: PlanState, edits: readonly PlanEdit[]): PlanState {
  let next: PlanState = state;
  const dayNos = new Set(state.days.map((day) => day.day_no));
  for (const edit of edits) {
    if (edit.kind === 'reorder_days') {
      next = reorder(next, edit.order);
      continue;
    }
    if (edit.kind === 'add') {
      if (next.items.some((item) => item.stable_id === edit.item.stable_id)) {
        throw new PlanEditError('duplicate_item', edit.item.stable_id);
      }
      checkItem(edit.item, dayNos);
      next = { ...next, items: [...next.items, edit.item] };
      continue;
    }
    const index = next.items.findIndex((item) => item.stable_id === edit.stableId);
    if (index < 0) throw new PlanEditError('unknown_item', edit.stableId);
    if (edit.kind === 'remove') {
      next = { ...next, items: next.items.filter((_, i) => i !== index) };
      continue;
    }
    const patched = { ...(next.items[index] as PlanStateItem), ...edit.patch };
    checkItem(patched, dayNos);
    next = { ...next, items: next.items.map((item, i) => (i === index ? patched : item)) };
  }
  return next;
}
