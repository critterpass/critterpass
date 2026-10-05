/**
 * Grades: good = open, everyone free, travel fits with room to spare, dry, and not in a busy
 * window when a quiet one exists; possible = it fits with a trade-off (busy, rain risk, tight,
 * a detour, a flexible item to move, only some of the crew, or the crew split on it); no = closed,
 * no window, or a travel day without room. More travel can only lower a grade.
 */
import type { FitGrade, FitReason } from '@cp/domain';

import type { FitThresholds, MealWindows } from './context';
import { minutesOutside, type KindWindows } from './kind-time';
import { clockOf, type DayModel } from './day-model';
import { crowdReasons, rainCheck, slotIsBusy, type CrowdDay } from './reasons';
import type { Candidate } from './slot';

export interface GradeInput {
  readonly model: DayModel;
  readonly crowd: CrowdDay | null;
  readonly quiet: boolean;
  readonly outdoor: boolean;
  readonly food: boolean;
  readonly split: { readonly want: number; readonly ratherNot: number } | null;
  readonly thresholds: FitThresholds;
  readonly meals: MealWindows;
  /** The hours of the day the place is for (./kind-time). */
  readonly kind: KindWindows;
}

export interface GradedSlot {
  readonly candidate: Candidate;
  readonly grade: Exclude<FitGrade, 'no'>;
  /** Lower is better among slots of one grade: a meal window kept free or used for food. */
  readonly mealPenalty: number;
  /** Minutes outside the place's own hours of the day (a bar at ten in the morning); 0 inside. */
  readonly ownTimeGap: number;
  /** Minutes outside where a place with no hour of its own is nudged to (not its opening minute). */
  readonly usualTimeGap: number;
  readonly reasons: FitReason[];
}

function travelReason(candidate: Candidate): FitReason[] {
  const leg = candidate.legIn;
  if (leg === null) return [];
  const prev = candidate.prev;
  const params = {
    minutes: Math.min(leg.minutes, 1440),
    from: prev === null ? ('stay' as const) : ('item' as const),
    approx: leg.approx,
    ...(prev === null ? {} : { stable_id: prev.stableId }),
  };
  return [{ code: leg.mode === 'walk' ? 'walk_minutes' : 'drive_minutes', params }];
}

function mealPenalty(input: GradeInput, candidate: Candidate): number {
  const { lunch, dinner, breakfast } = input.meals;
  const within = (window: { fromMin: number; toMin: number }) =>
    candidate.start >= window.fromMin && candidate.start < window.toMin;
  if (input.food) {
    // A meal place inside its own meal stretch (../draft/day-rules) is where it belongs.
    if (input.kind.own.length > 0 && minutesOutside(input.kind.own, candidate.start) === 0)
      return 0;
    return within(lunch) || within(dinner) || within(breakfast) ? 0 : 1;
  }
  const swallows = [lunch, dinner].some((window) => {
    const covered =
      Math.min(candidate.end, window.toMin) - Math.max(candidate.start, window.fromMin);
    return covered > window.toMin - window.fromMin - 60;
  });
  return swallows ? 1 : 0;
}

export function gradeCandidate(input: GradeInput, candidate: Candidate): GradedSlot {
  const { model, thresholds } = input;
  const { start, end } = candidate;
  const busy = input.quiet && slotIsBusy(input.crowd, start, end, thresholds.busyLevel);
  const rain = rainCheck(model.day.rain, input.outdoor, start, end, model.day.fromMin, thresholds);
  const tight = candidate.slack !== null && candidate.slack < thresholds.slackMin;
  const detour = candidate.detour !== null && candidate.detour > thresholds.detourMin;
  const subset = candidate.who.length < model.everyone.length;
  const split = input.split !== null && input.split.want > 0 && input.split.ratherNot > 0;
  const tradeOff = busy || rain.rainy || tight || detour || subset || split;
  const reasons: FitReason[] = [];
  if (candidate.span.start === start && start > 0) {
    reasons.push({ code: 'opens_at', params: { time: clockOf(start) } });
  }
  if (candidate.span.end - end <= 30 && candidate.span.end < 1440) {
    reasons.push({ code: 'closes_at', params: { time: clockOf(candidate.span.end) } });
  }
  reasons.push(
    ...crowdReasons(input.crowd, start, end, thresholds.busyLevel, candidate.span.start),
  );
  reasons.push(...travelReason(candidate));
  reasons.push(...rain.reasons);
  if (candidate.needsMove !== null) {
    reasons.push({ code: 'needs_move', params: { stable_id: candidate.needsMove.stableId } });
  }
  if (candidate.detour !== null && candidate.prev !== null && !detour) {
    reasons.push({
      code: 'on_the_way',
      params: { stable_id: candidate.prev.stableId, detour_minutes: candidate.detour },
    });
  } else if (candidate.prev !== null) {
    reasons.push({ code: 'after_item', params: { stable_id: candidate.prev.stableId } });
  }
  if (candidate.next !== null) {
    reasons.push({ code: 'before_item', params: { stable_id: candidate.next.stableId } });
  }
  if (model.items.length === 0) {
    reasons.push({ code: 'free_day', params: { day_no: model.day.dayNo } });
  }
  if (model.day.kind === 'arrival') {
    reasons.push({ code: 'first_night', params: { day_no: model.day.dayNo } });
  }
  if (subset) reasons.push({ code: 'who_free', params: { user_ids: [...candidate.who] } });
  if (split && input.split !== null) {
    reasons.push({
      code: 'crew_split',
      params: { want: input.split.want, rather_not: input.split.ratherNot },
    });
  }
  return {
    candidate,
    grade: tradeOff || candidate.needsMove !== null ? 'possible' : 'good',
    mealPenalty: mealPenalty(input, candidate),
    ownTimeGap: minutesOutside(input.kind.own, start),
    // A place that fills up later is best early: the crowd decides, not the clock.
    usualTimeGap: reasons.some((reason) => reason.code === 'busy_from')
      ? 0
      : minutesOutside([input.kind.usual], start),
    reasons,
  };
}

const RANK: Readonly<Record<GradedSlot['grade'], number>> = { good: 0, possible: 1 };

/** A slot inside the place's own hours of the day that moves no stop. */
export const inOwnTime = (slot: GradedSlot): boolean =>
  slot.ownTimeGap === 0 && slot.candidate.needsMove === null;

/** What a slot is ranked by, most important first; lower is better. */
function rankOf(slot: GradedSlot): readonly number[] {
  return [
    inOwnTime(slot) ? 0 : 1,
    RANK[slot.grade],
    slot.ownTimeGap,
    slot.mealPenalty,
    slot.usualTimeGap,
    slot.candidate.start,
  ];
}

/**
 * The day's slot: inside the place's own hours of the day when one is free there (a bar in the
 * evening, a restaurant at a meal), then the best grade, the nearest to those hours, a meal window
 * respected, from mid-morning on, then the earliest.
 */
export function pickSlot(slots: readonly GradedSlot[]): GradedSlot | null {
  let best: GradedSlot | null = null;
  let bestRank: readonly number[] = [];
  for (const slot of slots) {
    const rank = rankOf(slot);
    const at = rank.findIndex((value, index) => value !== bestRank[index]);
    if (best === null || (at !== -1 && (rank[at] ?? 0) < (bestRank[at] ?? 0))) {
      best = slot;
      bestRank = rank;
    }
  }
  return best;
}
