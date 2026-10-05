/**
 * Whether a change set leaves a plan that holds: the accepted changes are applied to the plan they
 * were made against and the result is run through the planner's own check (the same overlap and
 * travel rule the day view warns with). Only what one of the changed stops takes part in counts,
 * so the set is never blamed for a clash the plan already had.
 */
import { estimateStraightLineEta, type ChangeSetOp } from '@cp/domain';
import { checkFeasibility, type FeasibilityItem } from '@cp/planner';

import type { PlanItem } from '../../overview/model/plan-model';

export interface Collision {
  /** The changed stop, and the stop it collides with. */
  readonly stableId: string;
  readonly withId: string;
  readonly kind: 'overlap' | 'travel';
  /** Minutes overlapping, or minutes short to get there. */
  readonly minutes: number;
}

interface Timed {
  readonly stableId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly tz: string;
  readonly attendeeIds: readonly string[];
  readonly bookingId: string | null;
  readonly spot: { readonly lat: number; readonly lng: number } | null;
}

function timed(item: PlanItem, fallbackTz: string): Timed | null {
  if (item.startsAt === null || item.endsAt === null) return null;
  return {
    stableId: item.stableId,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    tz: item.tz ?? fallbackTz,
    attendeeIds: item.attendeeIds,
    bookingId: item.bookingId,
    spot: item.lat === null || item.lng === null ? null : { lat: item.lat, lng: item.lng },
  };
}

/** The plan's timed stops once the accepted changes are in. */
function after(base: readonly PlanItem[], ops: readonly ChangeSetOp[], tz: string): Timed[] {
  const items = new Map<string, Timed>();
  for (const item of base) {
    const entry = timed(item, tz);
    if (entry !== null) items.set(item.stableId, entry);
  }
  for (const op of ops) {
    if (op.accepted === false) continue;
    if (op.op === 'remove') {
      items.delete(op.target);
      continue;
    }
    const was = items.get(op.target);
    const startsAt = op.after?.starts_at ?? was?.startsAt;
    const endsAt = op.after?.ends_at ?? was?.endsAt;
    if (startsAt === undefined || endsAt === undefined) continue;
    items.set(op.target, {
      stableId: op.target,
      startsAt,
      endsAt,
      tz: op.after?.tz ?? was?.tz ?? tz,
      attendeeIds: op.after?.attendee_ids ?? was?.attendeeIds ?? [],
      bookingId: was?.bookingId ?? null,
      spot:
        op.after?.custom_place == null
          ? (was?.spot ?? null)
          : { lat: op.after.custom_place.lat, lng: op.after.custom_place.lng },
    });
  }
  return [...items.values()];
}

export function collisionsAfter(
  base: readonly PlanItem[],
  ops: readonly ChangeSetOp[],
  crew: readonly string[],
  tz: string,
): Collision[] {
  const changed = new Set(
    ops.filter((op) => op.accepted !== false && op.op !== 'remove').map((op) => op.target),
  );
  if (changed.size === 0) return [];
  const items = after(base, ops, tz);
  const spots = new Map(items.map((item) => [item.stableId, item.spot]));
  const checked: FeasibilityItem[] = items.map((item) => ({
    stableId: item.stableId,
    startsAt: new Date(item.startsAt),
    endsAt: new Date(item.endsAt),
    tz: item.tz,
    attendeeIds: item.attendeeIds,
    bookingId: item.bookingId,
  }));
  const { violations } = checkFeasibility({
    items: checked,
    members: crew,
    travel: (from, to) => {
      const a = spots.get(from);
      const b = spots.get(to);
      if (a == null || b == null) return null;
      return estimateStraightLineEta({
        originLat: a.lat,
        originLng: a.lng,
        destLat: b.lat,
        destLng: b.lng,
        mode: 'auto',
      }).minutes;
    },
  });
  return violations.flatMap((violation): Collision[] => {
    if (violation.code !== 'OVERLAP' && violation.code !== 'TRAVEL_TOO_LONG') return [];
    const { stableId, relatedId } = violation;
    if (stableId === null || relatedId === undefined) return [];
    if (!changed.has(stableId) && !changed.has(relatedId)) return [];
    const mine = changed.has(stableId) ? stableId : relatedId;
    return [
      {
        stableId: mine,
        withId: mine === stableId ? relatedId : stableId,
        kind: violation.code === 'OVERLAP' ? 'overlap' : 'travel',
        minutes: violation.minutes ?? 0,
      },
    ];
  });
}
