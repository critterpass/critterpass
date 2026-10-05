/**
 * What the planner does with a redrafted day once the guide has answered. Stops the guide could
 * not put right give way and meals are filled; on a rain redraft a stop left in the open air goes
 * indoors; a hole the new day is left with is filled again, unless she asked for a slower or
 * lighter day (then its note says the hours are free because she asked); an essential the day
 * lost is put back, moved to another day or reported; a slower day is then held to fewer stops
 * than it had (./redraft-pace); the notes are finished the way a draft's
 * are; a title that no longer matches the day (or was kept though its sights changed) is written
 * again (so is one promising a late morning on a day that starts early); and the summary says what moved, what left the trip, and when "less walking" could not
 * be done.
 */
import type { DraftDay, Itinerary } from '@cp/domain';
import { alignStableIds, type ValidationResult } from '@cp/planner';

import type { DraftModel } from './context';
import { fillThinDays } from './fill-days';
import { plannerLines, withFinalNotes } from './final-notes';
import { walkedMetres, wantsLessWalking } from './redraft-asks';
import { keepEssentials } from './redraft-essentials';
import type { RedraftPlanInput } from './redraft-input';
import { asksSlower, lateTitleEarlyDay, slowerDay } from './redraft-pace';
import { indoorsInstead, isOutdoors, wantsIndoors } from './redraft-rain';
import { retitleDays } from './retitle';
import { settle } from './settle';
import { shownName } from './shown-names';
import type { SkeletonDay } from './skeleton';
import { validate } from './validate';

const SUMMARY_MAX = 240;

export interface RedraftFinish {
  readonly day: DraftDay;
  /** The whole trip with the new day; another day changes only by an essential moved onto it. */
  readonly itinerary: Itinerary;
  readonly title: string | null;
  readonly summary: string | null;
  readonly final: ValidationResult;
  /** Essentials the redraft took off its day that now sit on another. */
  readonly moved: readonly { readonly poiId: string; readonly dayNo: number }[];
  /** Essentials the redraft took out of the trip (no other day had room), by place id. */
  readonly leftOut: readonly string[];
}

const withDay = (itinerary: Itinerary, day: DraftDay): Itinerary => ({
  ...itinerary,
  days: itinerary.days.map((d) => (d.day_no === day.day_no ? day : d)),
});

/** The guide's summary up to its first full stop, when it has more than one sentence. */
function firstSentence(text: string | null): string | null {
  const found = text === null ? null : /^.+?[.!?](?=\s)/u.exec(text);
  return found === null ? null : found[0];
}

const placesOf = (day: DraftDay) =>
  day.items.flatMap((item) => (item.poi_id === null ? [] : [item.poi_id]));

/** The day with its holes filled again, unless the fill brings back what the redraft took out. */
function refilled(
  input: RedraftPlanInput,
  skeleton: SkeletonDay,
  base: DraftDay,
  start: Itinerary,
): Itinerary {
  const before = new Set(placesOf(start.days.find((d) => d.day_no === input.dayNo) as DraftDay));
  const next = fillThinDays(input, [skeleton], start).itinerary;
  const day = next.days.find((d) => d.day_no === input.dayNo);
  if (day === undefined) return start;
  const was = new Set(placesOf(base));
  const rain = wantsIndoors(input);
  const unwanted = placesOf(day).some((id) => {
    if (before.has(id)) return false;
    const poi = input.pois.get(id);
    return was.has(id) || (rain && poi !== undefined && isOutdoors(poi));
  });
  return unwanted ? start : next;
}

export async function finishRedraft(
  model: DraftModel,
  input: RedraftPlanInput,
  skeleton: SkeletonDay,
  base: DraftDay,
  outcome: {
    readonly day: DraftDay;
    readonly title: string | null;
    readonly summary: string | null;
  },
): Promise<RedraftFinish> {
  const drafted = withDay(input.base, outcome.day);
  const settled = settle(input, [skeleton], drafted, validate(input, drafted), {
    dayNo: input.dayNo,
    fillThin: false,
  });
  const dry = indoorsInstead(input, skeleton, settled.itinerary);
  const slower = asksSlower(input);
  const full = slower ? dry : refilled(input, skeleton, base, dry);
  const kept = keepEssentials(input, skeleton, base, full);
  const paced = slower ? slowerDay(input, skeleton, base, kept.itinerary) : kept.itinerary;
  const aligned = {
    ...paced,
    days: paced.days.map((d) => (d.day_no === input.dayNo ? alignStableIds(base, d) : d)),
  };
  const dayIn = (plan: Itinerary) => plan.days.find((d) => d.day_no === input.dayNo) as DraftDay;
  const only = (plan: Itinerary) => withDay(aligned, dayIn(plan));
  // The day's notes are finished the way a draft's are; the other days stay as they are.
  const notes = { retitle: false, redrafted: { dayNo: input.dayNo, slower } };
  const noted = only(withFinalNotes(input, aligned, notes).itinerary);
  // A title kept though a sight left or joined the day no longer says what the day holds.
  const was = new Set(placesOf(base));
  const now = new Set(placesOf(dayIn(noted)));
  const sightsChanged = [...was].some((id) => !now.has(id)) || [...now].some((id) => !was.has(id));
  const stale =
    (sightsChanged && dayIn(noted).theme === base.theme) || lateTitleEarlyDay(input, dayIn(noted));
  const renamed = await retitleDays(model, input, noted, {
    only: [input.dayNo],
    also: stale ? [input.dayNo] : [],
  });
  const itinerary = only(
    withFinalNotes(input, renamed.itinerary, { ...notes, retitle: true }).itinerary,
  );
  const day = dayIn(itinerary);
  const words = plannerLines(input.locale).redraft;
  const name = (poiId: string) => {
    const poi = input.pois.get(poiId);
    return poi === undefined ? [] : [shownName(input, poi)];
  };
  // What she must know first: an essential off the trip, the walking not cut, then what moved.
  const lines = [
    ...kept.leftOut.flatMap((poiId) => name(poiId).map(words.leftOut)),
    ...(wantsLessWalking(input) && walkedMetres(input, day) >= walkedMetres(input, base)
      ? [words.walksKept]
      : []),
    ...(kept.moved.length === 0
      ? []
      : [words.moved(kept.moved.flatMap((entry) => name(entry.poiId)).join(', '))]),
  ];
  const said = lines.reduce((text, line) => {
    const next = text === '' ? line : `${text} ${line}`;
    return next.length <= SUMMARY_MAX ? next : text;
  }, '');
  // The guide's sentence gives way to these when both do not fit.
  const summary =
    lines.length === 0
      ? outcome.summary
      : ([outcome.summary, firstSentence(outcome.summary)]
          .map((lead) => (lead === null ? said : `${lead} ${said}`))
          .find((text) => text.length <= SUMMARY_MAX) ?? said);
  const title = outcome.title === null && day.theme === base.theme ? null : day.theme;
  return {
    day,
    itinerary,
    title,
    summary,
    final: settled.final,
    moved: kept.moved,
    leftOut: kept.leftOut,
  };
}
