/**
 * When a place fits the trip's days: per day a grade, a slot and the reasons, and the best day.
 * Pure and deterministic, so the server, the plan check and the phone give the same answer for
 * the same context. Only our own `pois.hours` feed it (unknown hours fall back to the usual hours
 * of the place's kind, labelled `hours_unknown`); no model output, supplier content or live
 * third-party attribute ever does.
 */
import {
  openSpans,
  visitMinutes,
  type DayFit,
  type FitGrade,
  type FitReason,
  type PlaceFit,
} from '@cp/domain';

import { usualHours } from '../draft/open-data';
import { instantAt } from '../draft/schedule-day';
import {
  DEFAULT_MEAL_WINDOWS,
  thresholdsOf,
  travelOf,
  type FitContext,
  type FitDay,
  type FitPlace,
} from './context';
import { buildDayModel } from './day-model';
import { gradeCandidate, pickSlot, type GradedSlot } from './grade';
import { crowdDay, quietExists } from './reasons';
import { candidates, opensLongEnough } from './slot';

const MAX_REASONS = 12;

interface DayResult {
  readonly fit: DayFit;
  readonly slot: GradedSlot | null;
  readonly fullness: number;
}

function noReasons(day: FitDay, opens: boolean): FitReason[] {
  if (!opens) return [{ code: 'closed_that_day', params: { day_no: day.dayNo } }];
  if (day.kind !== 'full') {
    return [{ code: 'travel_day', params: { day_no: day.dayNo, kind: day.kind } }];
  }
  return [{ code: 'no_window', params: { day_no: day.dayNo } }];
}

function fitDay(context: FitContext, place: FitPlace, day: FitDay): DayResult {
  const thresholds = thresholdsOf(context);
  const model = buildDayModel(day, context.participants, context.tz, place.stableId);
  const guessed = place.hours === null;
  const spans = openSpans(place.hours ?? usualHours(place.category), day.date);
  const visitMin = visitMinutes({
    category: place.category,
    timeNeededMin: place.timeNeededMin ?? null,
  });
  const search = { model, place, spans, visitMin, travel: travelOf(context) };
  const crowd = crowdDay(place, day.date, day.crowdFactor);
  const input = {
    model,
    crowd,
    quiet: quietExists(crowd, spans, day, visitMin, thresholds.busyLevel),
    outdoor: place.outdoor,
    food: place.category === 'food',
    split: place.stances ?? null,
    thresholds,
    meals: context.meals ?? DEFAULT_MEAL_WINDOWS,
  };
  const slot = pickSlot(candidates(search).map((candidate) => gradeCandidate(input, candidate)));
  const lead: FitReason[] = guessed ? [{ code: 'hours_unknown', params: {} }] : [];
  const tail: FitReason[] = place.bestTime ? [{ code: 'editorial_best_time', params: {} }] : [];
  if (slot === null) {
    return {
      fit: {
        day_id: day.dayId,
        day_no: day.dayNo,
        grade: 'no',
        slot: null,
        reasons: [...noReasons(day, opensLongEnough(search)), ...lead].slice(0, MAX_REASONS),
      },
      slot: null,
      fullness: model.items.length,
    };
  }
  const { candidate } = slot;
  return {
    fit: {
      day_id: day.dayId,
      day_no: day.dayNo,
      grade: slot.grade,
      slot: {
        starts_at: instantAt(day.date, candidate.start, context.tz).toISOString(),
        ends_at: instantAt(day.date, candidate.end, context.tz).toISOString(),
      },
      reasons: [...lead, ...slot.reasons, ...tail].slice(0, MAX_REASONS),
      insert_after: candidate.prev?.stableId ?? null,
      insert_before: candidate.next?.stableId ?? null,
      detour_minutes: candidate.detour,
      needs_move: candidate.needsMove?.stableId ?? null,
    },
    slot,
    fullness: model.items.length,
  };
}

const GRADE_RANK: Readonly<Record<FitGrade, number>> = { good: 0, possible: 1, no: 2 };

const driveMinutes = (result: DayResult): number =>
  (result.slot?.candidate.legIn?.minutes ?? 0) + (result.slot?.candidate.legOut?.minutes ?? 0);

/** The earliest good slot on the least full day, ties to fewer drive minutes. */
function bestOf(results: readonly DayResult[]): PlaceFit['best'] {
  const ranked = results
    .filter((result) => result.fit.grade !== 'no' && result.fit.slot !== null)
    .sort(
      (a, b) =>
        GRADE_RANK[a.fit.grade] - GRADE_RANK[b.fit.grade] ||
        a.fullness - b.fullness ||
        driveMinutes(a) - driveMinutes(b) ||
        a.fit.day_no - b.fit.day_no,
    );
  const top = ranked[0];
  if (top === undefined || top.fit.slot === null) return null;
  return {
    day_id: top.fit.day_id,
    day_no: top.fit.day_no,
    grade: top.fit.grade,
    slot: top.fit.slot,
  };
}

export function fitPlace(context: FitContext, place: FitPlace): PlaceFit {
  const results = context.days.map((day) => fitDay(context, place, day));
  return { poi_id: place.poiId, best: bestOf(results), days: results.map((r) => r.fit) };
}

export {
  DEFAULT_FIT_THRESHOLDS,
  DEFAULT_MEAL_WINDOWS,
  isOutdoorCategory,
  straightLineTravel,
  type CrowdSource,
  type FitContext,
  type FitCrowds,
  type FitDay,
  type FitDayKind,
  type FitItem,
  type FitLeg,
  type FitPlace,
  type FitPoint,
  type FitRain,
  type FitStop,
  type FitThresholds,
  type FitTravel,
  type MealWindow,
  type MealWindows,
  type WeatherSource,
} from './context';
