/**
 * Asserts for how a plan reads as a day a person would have: outings kept to their day, her
 * breakfast first, beaches early or late, real meal lengths, an evening for a crew that likes
 * the night, long visits given their time, titles that say what the day holds, reasons that agree
 * with their times, and no chat hedge in the plan. The redraft asserts hold a redraft to what she
 * asked: rain answered, the walking cut or said, the essentials it took off placed or reported, a
 * hole filled or left free because she asked, and a new title when its sights changed.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { foodRole, isKept, minuteOfDate, redraftDiff } from '@cp/planner';

import { spanOf } from '../../../src/prompts/draft/areas';
import type { DraftPlanInput } from '../../../src/prompts/draft/context';
import { titleFits } from '../../../src/prompts/draft/day-titles';
import { essentialsOf } from '../../../src/prompts/draft/essentials';
import { isForEvening, wantsEvenings } from '../../../src/prompts/draft/evenings';
import { plannerLines } from '../../../src/prompts/draft/final-notes';
import type { DraftPlanResult } from '../../../src/prompts/draft/pipeline';
import type { RedraftOutcome } from '../../../src/prompts/draft/redraft';
import { walkedMetres, wantsLessWalking } from '../../../src/prompts/draft/redraft-asks';
import { wantsIndoors } from '../../../src/prompts/draft/redraft-rain';
import { validate } from '../../../src/prompts/draft/validate';

const HEDGE = /^\s*from what .+ knows so far/iu;
const AFTER_LUNCH = /\bafter lunch\b|sau (bữa )?(ăn )?trưa/iu;
const DINNER_MIN_MIN = 45;

const at = (input: DraftPlanInput, day: DraftDay, iso: string) =>
  minuteOfDate(new Date(iso), day.date, input.frame.tz);
const nameOf = (input: DraftPlanInput, id: string | null) =>
  input.pois.get(id ?? '')?.name ?? String(id);

/** Rules every day of a plan keeps, whether drafted or redrafted. */
function dayRules(input: DraftPlanInput, day: DraftDay, titled = false): string[] {
  const fails: string[] = [];
  if (titled && !titleFits(input, day)) {
    fails.push(`title: "${day.theme}" does not fit day ${day.day_no}`);
  }
  if (HEDGE.test(day.theme)) fails.push(`hedge in the title of day ${day.day_no}`);
  for (const item of day.items) {
    const poi = input.pois.get(item.poi_id ?? '');
    const start = at(input, day, item.starts_at);
    const length = at(input, day, item.ends_at) - start;
    if (HEDGE.test(item.note ?? '')) fails.push(`hedge in a note on day ${day.day_no}`);
    if (AFTER_LUNCH.test(item.note ?? '') && start < 12 * 60) {
      fails.push(`reason: ${nameOf(input, item.poi_id)} says after lunch at ${start}`);
    }
    if (poi?.category === 'beach' && start > 10 * 60 + 30 && start < 15 * 60 && !isKept(item)) {
      fails.push(`beach: ${poi.name} at midday on day ${day.day_no}`);
    }
    if (item.kind === 'meal' && start >= 17 * 60 + 30 && length < DINNER_MIN_MIN) {
      fails.push(`dinner: ${nameOf(input, item.poi_id)} for ${length} minutes`);
    }
  }
  return fails;
}

export function gradePlanRules(
  input: DraftPlanInput,
  result: DraftPlanResult,
  summary: string,
): string[] {
  const { itinerary } = result;
  const fails = itinerary.days.flatMap((day) => dayRules(input, day));
  if (HEDGE.test(summary)) fails.push('hedge in the summary');
  const dayOf = new Map(
    itinerary.days.flatMap((day) => day.items.map((item) => [item.poi_id ?? '', day] as const)),
  );
  // An outing's places are on its day together.
  for (const outing of input.pools.outings) {
    for (const poiId of outing.poiIds) {
      const day = dayOf.get(poiId);
      if (day !== undefined && outing.dayNo !== null && day.day_no !== outing.dayNo) {
        fails.push(`outing: ${nameOf(input, poiId)} on day ${day.day_no}, not ${outing.dayNo}`);
      }
    }
  }
  // A breakfast she asked for opens its day.
  for (const mustDo of input.frame.mustDos) {
    if (mustDo.when !== 'morning' && mustDo.when !== 'sunrise') continue;
    const day = itinerary.days.find((d) => d.items.some((item) => item.must_do_id === mustDo.id));
    const first = day?.items[0];
    const poi = input.pois.get(mustDo.poiId ?? '');
    if (poi !== undefined && foodRole(poi) === 'meal' && first?.must_do_id !== mustDo.id) {
      fails.push(`breakfast: ${poi.name} does not open day ${day?.day_no ?? '?'}`);
    }
  }
  // A crew that likes the night has an evening out on a full day, where the city has one.
  const last = input.frame.dates.length;
  const full = itinerary.days.filter((day) => day.day_no > 1 && day.day_no < last);
  const evening = [...input.pois.values()].some((poi) => isForEvening(poi));
  if (wantsEvenings(input) && evening && full.length > 0) {
    const out = full.some((day) =>
      day.items.some((item) => item.kind !== 'meal' && at(input, day, item.starts_at) >= 19 * 60),
    );
    if (!out) fails.push('evening: no full day has a stop after dinner');
  }
  // A long visit has its half day or its day.
  for (const v of validate(input, itinerary).violations) {
    if (v.code === 'CROWDED_LONG_VISIT') {
      fails.push(`long visit crowded by ${nameOf(input, v.poiId ?? null)} on day ${v.dayNo}`);
    }
  }
  for (const day of itinerary.days) {
    const edge = day.day_no === 1 || day.day_no === last;
    for (const item of day.items) {
      const poi = input.pois.get(item.poi_id ?? '');
      if (edge && poi !== undefined && spanOf(input, poi) === 'full' && item.must_do_id === null) {
        fails.push(`whole-day visit ${poi.name} on day ${day.day_no}`);
      }
    }
  }
  return fails;
}

const placesOf = (day: DraftDay | undefined) =>
  new Set((day?.items ?? []).map((item) => item.poi_id ?? ''));

export function gradeRedraftRules(
  input: DraftPlanInput,
  base: Itinerary,
  dayNo: number,
  asked: { readonly reasons: readonly string[]; readonly note: string | null },
  outcome: RedraftOutcome,
): string[] {
  const before = base.days.find((d) => d.day_no === dayNo) as DraftDay;
  const fails = dayRules(input, outcome.day, true);
  const summary = outcome.summary ?? '';
  if (HEDGE.test(summary)) fails.push('hedge in the summary');
  if (wantsIndoors(asked) && redraftDiff(before, outcome.day).length === 0) {
    fails.push('rain: the day came back the same');
  }
  // An essential the day lost is on another day, or the summary says it left the trip.
  const now = placesOf(outcome.day);
  const trip = new Set(outcome.itinerary.days.flatMap((day) => [...placesOf(day)]));
  for (const poi of essentialsOf(input)) {
    if (!placesOf(before).has(poi.id) || now.has(poi.id)) continue;
    if (!trip.has(poi.id) && !outcome.leftOut.includes(poi.id)) {
      fails.push(`essential: ${poi.name} left the trip unreported`);
    }
    if (!summary.includes(poi.name) && !summary.includes(poi.nameLocal ?? '\u0000')) {
      fails.push(`essential: the summary does not say where ${poi.name} went`);
    }
  }
  const words = plannerLines(input.locale);
  if (wantsLessWalking(asked)) {
    const less = walkedMetres(input, outcome.day) < walkedMetres(input, before);
    if (!less && !summary.includes(words.redraft.walksKept)) {
      fails.push('less walking: neither cut nor said');
    }
  }
  // A hole in a redrafted day is filled, or free because she asked; never "nothing fits".
  const gaveUp = outcome.day.items.some((item) => (item.note ?? '').includes(words.freeTime));
  if (gaveUp) fails.push('holes: the redrafted day says nothing nearby fits');
  const sights = [...now].some((id) => !placesOf(before).has(id));
  if (sights && outcome.day.theme === before.theme) fails.push('title: kept though sights changed');
  return fails;
}
