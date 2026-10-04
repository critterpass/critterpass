/**
 * The trip outline: a theme and an area per day, which must-dos go on which day, and which of the
 * listed activities belong to it. Code then fixes what the outline got wrong before any day is
 * drafted: ids we do not know are dropped, a place picked for two days keeps its first, and a
 * must-do left out or put on a day it is closed moves to the lightest day it is open on. Then each
 * day is made workable (./skeleton-days.ts): stops that do not fit or sit too far away go back to
 * the pool, light days are topped up, and every day gets its own meal places and spares. The
 * outline also answers the must-dos members typed by hand (./wish-answers.ts). The request itself
 * is built in ./skeleton-request.ts.
 */
import { assignMeals, assignSpares, keepWhatFits, topUpDays } from './skeleton-days';
import { checkWishAnswers, whenOf, withWishAnswers, type WishAnswer } from './wish-answers';

import { parseStructuredText, textOf } from '../../structured';
import { aliases, placeNames, type DraftModel, type DraftPlanInput } from './context';
import { proseProblem, skeletonReplySchema } from './schema';
import { buildSkeletonRequest } from './skeleton-request';

export { buildSkeletonRequest, SKELETON_PROMPT_VERSION } from './skeleton-request';

export interface SkeletonDay {
  readonly dayNo: number;
  readonly date: string;
  readonly theme: string;
  readonly area: string;
  readonly mustDoIds: readonly string[];
  readonly poiIds: readonly string[];
  /** Meal places set aside for this day: the best eateries near its stops. */
  readonly mealIds: readonly string[];
  /** Unplanned activities set aside for this day only, for when a planned one does not fit. */
  readonly spareIds: readonly string[];
}

export interface SkeletonPlan {
  readonly stayArea: string;
  readonly days: readonly SkeletonDay[];
  /** Ids in the reply that were not on the lists (always dropped). */
  readonly unknownIds: number;
  /** Themes or areas with digits or links, replaced by a neutral phrase. */
  readonly proseRejected: number;
  /** The guide's answers to the typed must-dos (apply them with `withWishAnswers`). */
  readonly wishAnswers: readonly WishAnswer[];
  /** What code changed in the outline: planned stops it took out, and stops it added to light days. */
  readonly adjusted?: { readonly removed: number; readonly added: number };
}

export { mealsIn } from './skeleton-days';

/** Times of day that make a must-do a morning one. */
const MORNING_WISHES: ReadonlySet<string> = new Set(['sunrise', 'morning']);

export function normaliseSkeleton(asked: DraftPlanInput, raw: unknown): SkeletonPlan {
  const reply = skeletonReplySchema.parse(raw);
  const checked = checkWishAnswers(asked, reply.wishes, aliases(asked).resolvePlace);
  // From here on an answered wish is a must-do with its place.
  const input = withWishAnswers(asked, checked.answers);
  const { frame, pools } = input;
  const known = new Set(pools.activities.map((poi) => poi.id));
  const mustDoIds = new Set(pools.mustDos.map((slot) => slot.mustDoId));
  const taken = new Set<string>();
  let unknownIds = checked.unknownIds;
  let proseRejected = 0;
  const placed = new Map<string, number>();
  const answeredDay = new Map(checked.answers.map((a) => [a.wishId, a.dayNo]));
  // An answered wish's place is a must-do now: never also a day's activity.
  for (const slot of pools.mustDos) if (answeredDay.has(slot.mustDoId)) taken.add(slot.poiId);
  const days = frame.dates.map(
    (
      date,
      index,
    ): SkeletonDay & {
      mustDoIds: string[];
      spareIds: string[];
      poiIds: string[];
      mealIds: string[];
    } => {
      const dayNo = index + 1;
      const found = reply.days.find((day) => day.day_no === dayNo);
      const poiIds: string[] = [];
      for (const poiId of (found?.poi_ids ?? []).map(aliases(input).resolvePlace)) {
        if (!known.has(poiId)) {
          if (!input.pois.has(poiId) && !mustDoIds.has(aliases(input).resolveMustDo(poiId))) {
            unknownIds += 1;
          }
          continue;
        }
        // A place goes only on a day it is open (and, on the last day, near where the crew leaves).
        if (taken.has(poiId) || !(pools.openDays.get(poiId) ?? []).includes(dayNo)) continue;
        taken.add(poiId);
        poiIds.push(poiId);
      }
      const mine: string[] = [];
      const answered = [...answeredDay].flatMap(([wishId, day]) => (day === dayNo ? [wishId] : []));
      for (const mustDoId of [
        ...(found?.must_do_ids ?? []).map(aliases(input).resolveMustDo),
        ...answered,
      ]) {
        const slot = pools.mustDos.find((s) => s.mustDoId === mustDoId);
        if (slot === undefined) {
          // A wish named by its handle is no invention: its answer places it.
          const wish = /^w\d+$/u.test(mustDoId.trim().toLowerCase());
          if (!answeredDay.has(mustDoId) && !wish) unknownIds += 1;
          continue;
        }
        if (placed.has(mustDoId) || !slot.openDays.includes(dayNo)) continue;
        placed.set(mustDoId, dayNo);
        mine.push(mustDoId);
      }
      const clean = (text: string | undefined, fallback: string) => {
        if (text === undefined) return fallback;
        if (proseProblem(text, 60, placeNames(input)) === null) return text;
        proseRejected += 1;
        return fallback;
      };
      return {
        dayNo,
        date,
        theme: clean(found?.theme, 'A day in town'),
        area: clean(found?.area, 'the centre'),
        mustDoIds: mine,
        poiIds,
        mealIds: [],
        spareIds: [],
      };
    },
  );
  for (const slot of pools.mustDos) {
    if (placed.has(slot.mustDoId)) continue;
    const lightest = days
      .filter((day) => slot.openDays.includes(day.dayNo))
      .sort(
        (a, b) => a.mustDoIds.length + a.poiIds.length - (b.mustDoIds.length + b.poiIds.length),
      )[0];
    lightest?.mustDoIds.push(slot.mustDoId);
  }
  // A wish for a morning is not left for the morning the crew leaves when an earlier one is free.
  const last = days[days.length - 1];
  for (const mustDoId of [...(last?.mustDoIds ?? [])]) {
    const slot = pools.mustDos.find((s) => s.mustDoId === mustDoId);
    const when = whenOf(input, mustDoId);
    if (last === undefined || slot === undefined || !MORNING_WISHES.has(when ?? '')) continue;
    const earlier = days.find(
      (day) => day.dayNo > 1 && day.dayNo < last.dayNo && slot.openDays.includes(day.dayNo),
    );
    if (earlier === undefined) continue;
    last.mustDoIds.splice(last.mustDoIds.indexOf(mustDoId), 1);
    earlier.mustDoIds.push(mustDoId);
  }
  // What the outline gave a day must fit its hours and sit together; light days are topped up.
  const planned = days.reduce((sum, day) => sum + day.poiIds.length, 0);
  keepWhatFits(input, days, taken);
  const kept = days.reduce((sum, day) => sum + day.poiIds.length, 0);
  const added = topUpDays(input, days, taken);
  assignMeals(input, days);
  assignSpares(input, days, taken);
  const stayArea =
    proseProblem(reply.stay_area, 60, placeNames(input)) === null ? reply.stay_area : 'the centre';
  return {
    stayArea,
    days,
    unknownIds,
    proseRejected,
    wishAnswers: checked.answers,
    adjusted: { removed: planned - kept, added },
  };
}

export async function runSkeleton(model: DraftModel, input: DraftPlanInput): Promise<SkeletonPlan> {
  const result = await model.call(input.skeletonRoute, buildSkeletonRequest(input), 'skeleton');
  const raw = parseStructuredText(textOf(result.message));
  if (raw === undefined) throw new Error('draft skeleton: reply was not JSON');
  return normaliseSkeleton(input, raw);
}
