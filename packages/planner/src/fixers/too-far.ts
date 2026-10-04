/**
 * Too far (7h-1 "Dinner in Jimbaran on the way back"): when a day drives too much, swap one stop
 * for a place of the same kind that keeps the day's times and cuts the drive the most. Candidates
 * are passed in (curated places near the day's route); the swap keeps the stop's time, its people
 * and its place in the order, needs the new place open for the whole visit and the travel either
 * side to fit, and must save at least a quarter of an hour in the car. Booked, locked and must-do
 * stops are never swapped. The op carries no `before`: whoever applies it fills that from the plan.
 */
import { openSpans, openThrough, type ChangeSetOp, type Hours } from '@cp/domain';

import { checkDays, itemOf, travelFor, type CheckDay } from '../check/rules/shared';
import type { CheckInput } from '../check/types';
import type { FitPoint } from '../fit/context';
import type { ModelItem } from '../fit/day-model';
import { routeDrive } from '../reorder/route';

export const MIN_SAVING_MIN = 15;

export interface TooFarCandidate {
  readonly poiId: string;
  readonly category: string;
  readonly point: FitPoint;
  /** Our own hours; null = unknown (never called closed). */
  readonly hours: Hours | null;
}

export interface TooFarAlternative {
  readonly dayId: string;
  readonly dayNo: number;
  /** The stop that is swapped, and the place it was. */
  readonly stableId: string;
  readonly fromPoiId: string | null;
  readonly poiId: string;
  readonly driveBefore: number;
  readonly driveAfter: number;
  /** Minutes from the stop before to the new place; null when it is the day's first stop. */
  readonly legInMin: number | null;
  readonly op: ChangeSetOp;
}

function legMinutes(check: CheckDay, a: ModelItem, b: { key: string } & FitPoint): number {
  if (a.point === null) return 0;
  return travelFor(check)({ key: a.stableId, ...a.point }, b)?.minutes ?? 0;
}

/** Whether the new place keeps the travel either side of the stop inside the gaps it has. */
function travelFits(check: CheckDay, item: ModelItem, here: { key: string } & FitPoint): boolean {
  const others = check.model.items.filter(
    (other) =>
      other.stableId !== item.stableId && [...item.people].some((uid) => other.people.has(uid)),
  );
  const before = others.filter((other) => other.end <= item.start).at(-1);
  const after = others.find((other) => other.start >= item.end);
  if (before !== undefined && item.start - before.end < legMinutes(check, before, here))
    return false;
  return after === undefined || after.start - item.end >= legMinutes(check, after, here);
}

function bestFor(
  check: CheckDay,
  candidates: readonly TooFarCandidate[],
  inPlan: ReadonlySet<string>,
): TooFarAlternative | null {
  const { model, day } = check;
  const travel = travelFor(check);
  const driveBefore = routeDrive(model.items, day.stay, travel);
  let best: TooFarAlternative | null = null;
  for (const item of model.items) {
    const source = itemOf(day, item.stableId);
    if (item.locked || item.point === null || source === undefined) continue;
    for (const candidate of candidates) {
      if (candidate.category !== source.category || inPlan.has(candidate.poiId)) continue;
      const spans = candidate.hours === null ? null : openSpans(candidate.hours, day.date);
      if (spans !== null && openThrough(spans, item.start, item.end) === null) continue;
      const here = { key: `poi:${candidate.poiId}`, ...candidate.point };
      if (!travelFits(check, item, here)) continue;
      const stops = model.items.map((stop) =>
        stop.stableId === item.stableId
          ? { ...stop, stableId: here.key, point: candidate.point }
          : stop,
      );
      const driveAfter = routeDrive(stops, day.stay, travel);
      if (driveBefore - driveAfter < MIN_SAVING_MIN) continue;
      if (
        best !== null &&
        (driveAfter > best.driveAfter ||
          (driveAfter === best.driveAfter && candidate.poiId >= best.poiId))
      ) {
        continue;
      }
      const previous = model.items
        .filter((other) => other.end <= item.start && other.point !== null)
        .at(-1);
      best = {
        dayId: day.dayId,
        dayNo: day.dayNo,
        stableId: item.stableId,
        fromPoiId: source.poiId,
        poiId: candidate.poiId,
        driveBefore,
        driveAfter,
        legInMin: previous === undefined ? null : legMinutes(check, previous, here),
        op: {
          op: 'swap',
          target: item.stableId,
          after: { poi_id: candidate.poiId, custom_place: null },
          reason: 'check_fix_too_far',
          affected_user_ids: [...item.people].sort(),
          booking_impact: false,
        },
      };
    }
  }
  return best;
}

/** The swap that cuts the day's drive most, or null (no such day, nothing near enough). */
export function tooFarAlternative(
  input: CheckInput,
  dayId: string,
  candidates: readonly TooFarCandidate[],
): TooFarAlternative | null {
  const check = checkDays(input).find((entry) => entry.day.dayId === dayId);
  if (check === undefined) return null;
  const inPlan = new Set(
    input.context.days.flatMap((day) =>
      day.items.flatMap((item) => (item.poiId === null ? [] : [item.poiId])),
    ),
  );
  return bestFor(check, candidates, inPlan);
}
