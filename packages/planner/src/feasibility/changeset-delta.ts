/**
 * Change review numbers (3e-3): what a ChangeSet does to each person's share ("+$22 EACH"), how
 * many bookings it moves and how many must-dos it touches. Items are priced by `@cp/cost-engine`
 * from their cost model, so the chip and the ledger can never disagree.
 */
import {
  computeShares,
  displayDelta,
  type CostComponent,
  type CurrencyCode,
  type FxContext,
  type Money,
} from '@cp/cost-engine';
import { type ChangeSetOp, type PlanItemSnapshot } from '@cp/domain';

export type PlanItemState = PlanItemSnapshot & { readonly stable_id: string };

/** Applies ChangeSet ops to a set of items (add / remove / move / retime / swap by `stable_id`). */
export function applyChangeSetOps(
  items: readonly PlanItemState[],
  ops: readonly ChangeSetOp[],
): readonly PlanItemState[] {
  let next = [...items];
  for (const op of ops) {
    if (op.op === 'add') {
      next = [
        ...next.filter((i) => i.stable_id !== op.target),
        { ...(op.after ?? {}), stable_id: op.target },
      ];
    } else if (op.op === 'remove') {
      next = next.filter((i) => i.stable_id !== op.target);
    } else {
      next = next.map((i) => (i.stable_id === op.target ? { ...i, ...(op.after ?? {}) } : i));
    }
  }
  return next;
}

/** Priced plan items as engine components: per-person, or one total split across attendees. */
export function planItemComponents(
  items: readonly PlanItemState[],
  seenAt: string,
): readonly CostComponent[] {
  return items.flatMap((item) => {
    if (item.amount_minor === undefined || !item.currency || !item.cost_model) return [];
    return [
      {
        id: `item:${item.stable_id}`,
        kind: 'activity' as const,
        unit: item.cost_model === 'per_person' ? ('person' as const) : ('group' as const),
        amountMinor: BigInt(item.amount_minor),
        currency: item.currency,
        source: 'user' as const,
        seenAt,
        ...(item.attendee_ids && item.attendee_ids.length > 0
          ? { memberIds: item.attendee_ids }
          : {}),
      },
    ];
  });
}

export interface ChangeReviewInput {
  readonly items: readonly PlanItemState[];
  readonly ops: readonly ChangeSetOp[];
  readonly members: readonly { readonly uid: string; readonly origin: string | null }[];
  readonly currency: CurrencyCode;
  readonly fx?: FxContext;
  /** Reference instant stamped on derived components (pricing is not time-dependent). */
  readonly seenAt: string;
}

export interface ChangeReview {
  readonly perMember: readonly {
    readonly uid: string;
    readonly delta: Money;
    readonly displayDelta: Money;
  }[];
  /** The shared "+$22 each" label when every member's rounded delta is the same, else `null`. */
  readonly each: Money | null;
  readonly bookingsMoved: number;
  readonly mustDosTouched: number;
}

const timeKey = (item: PlanItemSnapshot | null | undefined) =>
  `${item?.starts_at ?? ''}|${item?.ends_at ?? ''}|${item?.day_no ?? ''}`;

export function changeSetReview(input: ChangeReviewInput): ChangeReview {
  const after = applyChangeSetOps(input.items, input.ops);
  const price = (items: readonly PlanItemState[]) =>
    computeShares({
      currency: input.currency,
      members: input.members,
      components: planItemComponents(items, input.seenAt),
      ...(input.fx ? { fx: input.fx } : {}),
    });
  const was = price(input.items);
  const now = price(after);
  const perMember =
    was.status === 'ok' && now.status === 'ok'
      ? now.members.map((member) => {
          const before = {
            amountMinor: was.members.find((m) => m.uid === member.uid)?.totalMinor ?? 0n,
            currency: input.currency,
          };
          const current = { amountMinor: member.totalMinor, currency: input.currency };
          return {
            uid: member.uid,
            delta: {
              amountMinor: current.amountMinor - before.amountMinor,
              currency: input.currency,
            },
            displayDelta: displayDelta(before, current),
          };
        })
      : [];
  const first = perMember[0]?.displayDelta;
  const uniform = first && perMember.every((m) => m.displayDelta.amountMinor === first.amountMinor);

  const byId = new Map(input.items.map((i) => [i.stable_id, i]));
  let bookingsMoved = 0;
  let mustDosTouched = 0;
  for (const op of input.ops) {
    const before = byId.get(op.target) ?? op.before ?? null;
    const merged = op.op === 'remove' ? null : { ...(before ?? {}), ...(op.after ?? {}) };
    if (before?.booking_id && (merged === null || timeKey(before) !== timeKey(merged))) {
      bookingsMoved += 1;
    }
    if (before?.must_do_id || op.after?.must_do_id) mustDosTouched += 1;
  }
  return { perMember, each: uniform ? first : null, bookingsMoved, mustDosTouched };
}
