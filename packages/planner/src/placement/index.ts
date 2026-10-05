/**
 * Tokek placing ideas (docs/api-contracts-planning.md, `ai.place_ideas`): assigns the crew's ideas
 * to days by fit, the scarcest first (the idea with the fewest days that take it goes before the
 * ones that fit anywhere). Nothing already in the plan moves: an idea that only fits by moving a
 * stop, an idea the crew is split on, and an idea no day takes are left for the person to decide,
 * each with why. A placed idea is a stop for the whole crew, so it only goes where the whole crew
 * is free: a slot that works for some of them while the others are at another stop (booked or
 * not) is no slot for it. A day never goes past the pace limit. Pure and deterministic: ties go to the
 * lower idea id, and the order the ideas arrive in never changes the answer.
 */
import type { FitGrade, FitReason, PlaceFit } from '@cp/domain';

import type { FitContext, FitDay, FitItem, FitPlace } from '../fit/context';
import { fitPlace } from '../fit/index';

export interface PlacementIdea {
  readonly ideaId: string;
  readonly place: FitPlace;
}

export interface PlacementOptions {
  /** Stops a day may hold after placing (the plan check's pace limit). */
  readonly maxStopsPerDay?: number;
}

export const DEFAULT_MAX_STOPS_PER_DAY = 6;

export interface PlacedIdea {
  readonly ideaId: string;
  readonly poiId: string | null;
  readonly dayId: string;
  readonly dayNo: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly grade: Exclude<FitGrade, 'no'>;
  /** The stop it follows on its day, if any (an existing stable id or a placed idea's id). */
  readonly insertAfter: string | null;
  /** Its number among the day's stops once everything is placed (1 = first). */
  readonly number: number;
  readonly reasons: readonly FitReason[];
}

/** Why an idea was left for the person: the crew is split, a stop would have to move, the days it
 * fits are full, or no day takes it. */
export type LeftReason = 'split' | 'needs_move' | 'full' | 'no_day';

export interface LeftIdea {
  readonly ideaId: string;
  readonly poiId: string | null;
  readonly reason: LeftReason;
  /** The day it would go on (needs a move, or full), if any. */
  readonly dayNo: number | null;
  /** The stop that would have to move. */
  readonly needsMove: string | null;
  readonly reasons: readonly FitReason[];
}

export interface Placement {
  readonly placed: readonly PlacedIdea[];
  readonly left: readonly LeftIdea[];
  /** The context with the placed ideas as stops, so callers can check the result. */
  readonly context: FitContext;
}

const GRADE_RANK: Readonly<Record<FitGrade, number>> = { good: 0, possible: 1, no: 2 };

const isSplit = (place: FitPlace): boolean =>
  place.stances != null && place.stances.want > 0 && place.stances.ratherNot > 0;

const byId = <T extends { readonly ideaId: string }>(a: T, b: T): number =>
  a.ideaId < b.ideaId ? -1 : a.ideaId > b.ideaId ? 1 : 0;

/** The slot is only for the part of the crew that is free then (`who_free`). */
const forSomeOnly = (day: PlaceFit['days'][number]): boolean =>
  day.reasons.some((reason) => reason.code === 'who_free');

/** The days that take the place as they are: a slot for the whole crew, with no stop moved. */
function fitsWithoutMoving(fit: PlaceFit): PlaceFit['days'] {
  return fit.days.filter(
    (day) =>
      day.grade !== 'no' &&
      day.slot !== null &&
      (day.needs_move ?? null) === null &&
      !forSomeOnly(day),
  );
}

function withItem(context: FitContext, dayId: string, item: FitItem): FitContext {
  return {
    ...context,
    days: context.days.map((day) =>
      day.dayId === dayId ? { ...day, items: [...day.items, item] } : day,
    ),
  };
}

function leftFor(idea: PlacementIdea, fit: PlaceFit, full: ReadonlySet<string>): LeftIdea {
  const base = { ideaId: idea.ideaId, poiId: idea.place.poiId };
  const moving = fit.days.find((day) => day.grade !== 'no' && (day.needs_move ?? null) !== null);
  const fullDay = fitsWithoutMoving(fit).find((day) => full.has(day.day_id));
  if (fullDay !== undefined) {
    return { ...base, reason: 'full', dayNo: fullDay.day_no, needsMove: null, reasons: [] };
  }
  if (moving !== undefined) {
    return {
      ...base,
      reason: 'needs_move',
      dayNo: moving.day_no,
      needsMove: moving.needs_move ?? null,
      reasons: moving.reasons,
    };
  }
  const reasons = fit.days.flatMap((day) => day.reasons.slice(0, 1));
  return { ...base, reason: 'no_day', dayNo: null, needsMove: null, reasons };
}

function numberStops(context: FitContext, placed: readonly Omit<PlacedIdea, 'number'>[]) {
  const order = new Map<string, number>();
  for (const day of context.days) {
    const sorted = [...day.items].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || (a.stableId < b.stableId ? -1 : 1),
    );
    sorted.forEach((item, index) => order.set(item.stableId, index + 1));
  }
  return placed.map((entry) => ({ ...entry, number: order.get(entry.ideaId) ?? 0 }));
}

function dayLoad(day: FitDay): number {
  return day.items.length;
}

export function placeIdeas(
  context: FitContext,
  ideas: readonly PlacementIdea[],
  options: PlacementOptions = {},
): Placement {
  const limit = options.maxStopsPerDay ?? DEFAULT_MAX_STOPS_PER_DAY;
  const unique = [...new Map(ideas.map((idea) => [idea.ideaId, idea])).values()].sort(byId);
  const left: LeftIdea[] = [];
  const candidates: { idea: PlacementIdea; scarcity: number }[] = [];
  for (const idea of unique) {
    if (isSplit(idea.place)) {
      const fit = fitPlace(context, idea.place);
      const reasons = fit.days.flatMap((day) =>
        day.reasons.filter((reason) => reason.code === 'crew_split').slice(0, 1),
      );
      left.push({
        ideaId: idea.ideaId,
        poiId: idea.place.poiId,
        reason: 'split',
        dayNo: fit.best?.day_no ?? null,
        needsMove: null,
        reasons: reasons.slice(0, 1),
      });
      continue;
    }
    candidates.push({ idea, scarcity: fitsWithoutMoving(fitPlace(context, idea.place)).length });
  }
  candidates.sort((a, b) => a.scarcity - b.scarcity || byId(a.idea, b.idea));

  let current = context;
  const placed: Omit<PlacedIdea, 'number'>[] = [];
  for (const { idea } of candidates) {
    const fit = fitPlace(current, idea.place);
    const loads = new Map(current.days.map((day) => [day.dayId, dayLoad(day)]));
    const full = new Set(
      current.days.filter((day) => dayLoad(day) >= limit).map((day) => day.dayId),
    );
    const open = fitsWithoutMoving(fit)
      .filter((day) => !full.has(day.day_id))
      .sort(
        (a, b) =>
          GRADE_RANK[a.grade] - GRADE_RANK[b.grade] ||
          (loads.get(a.day_id) ?? 0) - (loads.get(b.day_id) ?? 0) ||
          (a.detour_minutes ?? 0) - (b.detour_minutes ?? 0) ||
          a.day_no - b.day_no,
      );
    const day = open[0];
    if (day === undefined || day.slot === null || day.grade === 'no') {
      left.push(leftFor(idea, fit, full));
      continue;
    }
    const startsAt = new Date(day.slot.starts_at);
    const endsAt = new Date(day.slot.ends_at);
    current = withItem(current, day.day_id, {
      stableId: idea.ideaId,
      poiId: idea.place.poiId,
      category: idea.place.category,
      startsAt,
      endsAt,
      attendeeIds: [],
      locked: false,
      outdoor: idea.place.outdoor,
      point: idea.place.point,
    });
    placed.push({
      ideaId: idea.ideaId,
      poiId: idea.place.poiId,
      dayId: day.day_id,
      dayNo: day.day_no,
      startsAt,
      endsAt,
      grade: day.grade,
      insertAfter: day.insert_after ?? null,
      reasons: day.reasons,
    });
  }
  return { placed: numberStops(current, placed), left: left.sort(byId), context: current };
}

export { drivingDeltaMinutes, type DriveStop, type DrivingDeltaInput } from './driving-delta';
