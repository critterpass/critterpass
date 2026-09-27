/**
 * The autonomy policy (docs/product-decisions.md, approval authority): whether the guide may run an action on
 * its own (with UNDO), must get a yes first, or may not run it at all. Pure: the executor supplies
 * the action's facts and the clock.
 *
 * - `auto` only when the action is reversible, free (no cost delta, no booking impact) and touches
 *   exactly the requester's own items ("Tokek moved Rin's pickup · UNDO" when Rin asked).
 * - Money → majority of the affected (organiser breaks ties).
 * - Others affected: time-critical in-trip → any affected; otherwise majority of the affected.
 * - Only the requester affected (irreversible) → self; nobody identifiable → organiser.
 * - Forbidden kinds (and any unregistered kind) → `forbidden`: drafts only, never run.
 *
 * A vote closes by the earliest of: the approval window, the start of any touched item still ahead,
 * and every hold expiry (`closes_at` ≤ earliest hold expiry; expiry keeps the current plan).
 */
import { isForbiddenActionKind, type DeciderPolicy } from './kinds';

export const DEFAULT_APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AutonomyAction {
  readonly kind: string;
  readonly reversible: boolean;
  /** Money moved by the action, in minor units of any currency; 0 = free. */
  readonly costDeltaMinor: number;
  /** Any op changes a booking (always a supplier matter). */
  readonly bookingImpact: boolean;
  readonly affectedUserIds: readonly string[];
  /** Who asked the guide; null for a proactive action (disruption, forecast). */
  readonly requesterId: string | null;
  /** A disruption the crew must answer now (flight delay, closure). */
  readonly timeCritical: boolean;
}

export interface AutonomyContext {
  readonly now: Date;
  /** The trip is under way (`trips.status = 'in_trip'`). */
  readonly inTrip: boolean;
  readonly holdExpiries?: readonly Date[];
  /** Start times of the touched items, before and after the change. */
  readonly itemStarts?: readonly Date[];
  readonly approvalWindowMs?: number;
}

export type NeedsYesReason =
  'money' | 'others_affected' | 'time_critical' | 'irreversible' | 'no_requester';

export type AutonomyDecision =
  | { readonly outcome: 'auto' }
  | {
      readonly outcome: 'needs_yes';
      readonly reason: NeedsYesReason;
      readonly decider_policy: DeciderPolicy;
      /** Yes votes needed among `affected_user_ids` (1 for self/organiser/any_affected). */
      readonly threshold: number;
      readonly tie_breaker: 'organiser' | null;
      readonly affected_user_ids: readonly string[];
      readonly closes_at: string;
    }
  | { readonly outcome: 'forbidden'; readonly reason: 'forbidden_kind' };

function earliest(dates: readonly Date[]): Date | undefined {
  let min: Date | undefined;
  for (const date of dates) if (min === undefined || date < min) min = date;
  return min;
}

/** When a vote on the action must close. */
export function approvalClosesAt(ctx: AutonomyContext): Date {
  const window = new Date(ctx.now.getTime() + (ctx.approvalWindowMs ?? DEFAULT_APPROVAL_WINDOW_MS));
  const aheadStarts = (ctx.itemStarts ?? []).filter((start) => start > ctx.now);
  return earliest([window, ...aheadStarts, ...(ctx.holdExpiries ?? [])]) ?? window;
}

/**
 * End of an applied action's undo window: the default window or the start of a touched item,
 * whichever comes first. An item that has already started closes the window at once.
 */
export function undoWindowEnd(
  now: Date,
  itemStarts: readonly Date[],
  windowMs: number = DEFAULT_UNDO_WINDOW_MS,
): Date {
  const window = new Date(now.getTime() + windowMs);
  const end = earliest([window, ...itemStarts]) ?? window;
  return end < now ? now : end;
}

export function decideAutonomy(action: AutonomyAction, ctx: AutonomyContext): AutonomyDecision {
  if (isForbiddenActionKind(action.kind)) return { outcome: 'forbidden', reason: 'forbidden_kind' };

  const affected = [...new Set(action.affectedUserIds)].sort();
  const others = affected.filter((id) => id !== action.requesterId);
  const money = action.costDeltaMinor !== 0 || action.bookingImpact;
  const ownOnly = action.requesterId !== null && affected.length > 0 && others.length === 0;
  if (ownOnly && action.reversible && !money) return { outcome: 'auto' };

  const closesAt = approvalClosesAt(ctx).toISOString();
  const needsYes = (
    reason: NeedsYesReason,
    policy: DeciderPolicy,
    threshold: number,
    tieBreaker: 'organiser' | null = null,
  ): AutonomyDecision => ({
    outcome: 'needs_yes',
    reason,
    decider_policy: policy,
    threshold,
    tie_breaker: tieBreaker,
    affected_user_ids: affected,
    closes_at: closesAt,
  });
  const majority = Math.floor(affected.length / 2) + 1;

  if (money) {
    return affected.length === 0
      ? needsYes('money', 'organiser', 1)
      : needsYes('money', 'majority_of_affected', majority, 'organiser');
  }
  if (others.length > 0) {
    return action.timeCritical && ctx.inTrip
      ? needsYes('time_critical', 'any_affected', 1)
      : needsYes('others_affected', 'majority_of_affected', majority, 'organiser');
  }
  if (ownOnly) return needsYes('irreversible', 'self', 1);
  return needsYes('no_requester', 'organiser', 1);
}
