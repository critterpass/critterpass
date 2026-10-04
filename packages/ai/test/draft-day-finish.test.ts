/**
 * What the planner finishes once a day's stops are settled: a title that still matches the day, a
 * note where a ride is the day's long one or a meal has no place we know, variety in what it
 * picks itself, and a stop the organiser placed by hand left where it is.
 */
import type { Itinerary } from '@cp/domain';
import { choicesOfDay, foodRole, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, baselineItinerary, planInput } from '../evals/draft/cases';
import { hopCap } from '../src/prompts/draft/areas';
import { fillMeals } from '../src/prompts/draft/complete-days';
import { scheduleChoices } from '../src/prompts/draft/day';
import { titleFits, titleFrom, withFittingTitles } from '../src/prompts/draft/day-titles';
import { LONG_RIDE_NOTE, NO_MEAL_NOTE, withFinalNotes } from '../src/prompts/draft/final-notes';
import { settle } from '../src/prompts/draft/settle';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';
import { validate } from '../src/prompts/draft/validate';
import { byVariety, kindOf, MAX_SAME_KIND, oneTooMany } from '../src/prompts/draft/variety';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const input = planInput(crew);
const base = baselineItinerary(input);
const day2 = base.days[1] as Itinerary['days'][number];
const named = (start: string): DraftPoi => {
  const poi = [...input.pois.values()].find((p) =>
    p.name.normalize('NFC').startsWith(start.normalize('NFC')),
  );
  if (poi === undefined) throw new Error(`no place ${start}`);
  return poi;
};
const outlineOf = (day: Itinerary['days'][number]): SkeletonDay => ({
  dayNo: day.day_no,
  date: day.date,
  theme: day.theme,
  area: 'the centre',
  mustDoIds: day.items.flatMap((item) => (item.must_do_id === null ? [] : [item.must_do_id])),
  poiIds: day.items.flatMap((item) =>
    item.kind === 'activity' && item.must_do_id === null && item.poi_id !== null
      ? [item.poi_id]
      : [],
  ),
  mealIds: [],
  spareIds: [],
});
const withDay = (day: Itinerary['days'][number]): Itinerary => ({
  ...base,
  days: base.days.map((d) => (d.day_no === day.day_no ? day : d)),
});

describe('a day title', { timeout: 60_000 }, () => {
  const sights = day2.items.filter((item) => item.kind === 'activity');

  it('is kept while the day holds what it names', () => {
    expect(titleFits(input, { ...day2, theme: 'A slow day in the hills' })).toBe(true);
    const first = input.pois.get(sights[0]?.poi_id ?? '') as DraftPoi;
    expect(titleFits(input, { ...day2, theme: `A morning at ${first.name}` })).toBe(true);
  });

  it('is written again when it promises a kind of place or names a place the day lacks', () => {
    expect(titleFits(input, { ...day2, theme: 'Old town and a show' })).toBe(false);
    const elsewhere = named('Langbiang');
    expect(day2.items.some((item) => item.poi_id === elsewhere.id)).toBe(false);
    expect(titleFits(input, { ...day2, theme: 'Up Langbiang at dawn' })).toBe(false);
    const fixed = withFittingTitles(input, withDay({ ...day2, theme: 'Old town and a show' }));
    expect(fixed.retitled).toBe(1);
    const title = fixed.itinerary.days[1]?.theme ?? '';
    expect(title).toBe(titleFrom(input, day2));
    expect(title.length).toBeLessThanOrEqual(60);
    // Made of the day's own stops.
    const names = sights.map((item) => input.pois.get(item.poi_id ?? '')?.name ?? '');
    expect(names.some((name) => name.startsWith(title.split(' and ')[0] ?? '?'))).toBe(true);
  });

  it('tells a church from a pagoda', () => {
    const church = named('Nhà thờ Con Gà');
    const only = scheduleChoices(
      input,
      { ...outlineOf(day2), mustDoIds: [], poiIds: [church.id] },
      [{ poiId: church.id, kind: 'activity', mustDoId: null, note: null }],
      'church',
    );
    expect(titleFits(input, { ...only, theme: 'Morning pagoda' })).toBe(false);
    expect(titleFits(input, { ...only, theme: 'The rooster church' })).toBe(true);
  });
});

describe('the last notes', { timeout: 60_000 }, () => {
  it('say which ride is the long one', () => {
    const cap = hopCap(input);
    const far = {
      ...day2,
      items: day2.items.map((item, index) =>
        index === 1 ? { ...item, travel_min: cap + 5 } : item,
      ),
    };
    const noted = withFinalNotes(input, withDay(far)).itinerary.days[1];
    expect(noted?.items[1]?.note).toContain(LONG_RIDE_NOTE);
    expect(noted?.items[0]?.note ?? '').not.toContain(LONG_RIDE_NOTE);
  });

  it('say so when a day has no lunch or dinner, instead of skipping it silently', () => {
    const unfed = { ...day2, items: day2.items.filter((item) => item.kind !== 'meal') };
    const notes = (withFinalNotes(input, withDay(unfed)).itinerary.days[1]?.items ?? [])
      .map((item) => item.note ?? '')
      .join(' ');
    expect(notes).toContain(NO_MEAL_NOTE.lunch);
    expect(notes).toContain(NO_MEAL_NOTE.dinner);
    const fed = fillMeals(input, [outlineOf(unfed)], withDay(unfed)).itinerary;
    const after = (withFinalNotes(input, fed).itinerary.days[1]?.items ?? [])
      .map((item) => item.note ?? '')
      .join(' ');
    expect(after).not.toContain(NO_MEAL_NOTE.lunch);
  });
});

describe('variety', () => {
  const temples = input.pools.sights.filter((poi) => poi.category === 'temple_shrine');
  const others = input.pools.sights.filter(
    (poi) => poi.category !== 'temple_shrine' && foodRole(poi) === null,
  );

  it('stops a day at three of a kind while another kind is offered', () => {
    const three = temples.slice(0, MAX_SAME_KIND).map((poi) => poi.id);
    const fourth = temples[MAX_SAME_KIND] as DraftPoi;
    expect(oneTooMany(input, three, fourth)).toBe(true);
    expect(oneTooMany(input, three.slice(0, 2), fourth)).toBe(false);
    const offered = byVariety(input, [fourth, others[0] as DraftPoi], three, three);
    expect(offered.map((poi) => poi.id)).toEqual([others[0]?.id]);
    // With nothing else on the list, one more of the kind is better than a hole.
    expect(byVariety(input, [fourth], three, three)).toEqual([fourth]);
  });

  it('takes the kind the day lacks first, then one the trip has not had', () => {
    const [a, b] = temples as [DraftPoi, DraftPoi];
    const fresh = others.find((poi) => kindOf(poi) !== kindOf(others[0] as DraftPoi)) as DraftPoi;
    const first = others[0] as DraftPoi;
    // The trip has had a temple and the first other kind; `fresh` is a kind it has not had.
    const order = byVariety(input, [b, first, fresh], [a.id], [a.id, first.id]);
    expect(order[0]?.id).toBe(fresh.id);
    expect(order[order.length - 1]?.id).toBe(b.id);
  });
});

describe('a stop placed by hand', { timeout: 60_000 }, () => {
  it('stays through the planner’s own repairs, lock and all', () => {
    // A lake an hour out of town, put by hand between two stops in the centre.
    const lake = named('Hồ Đơn Dương');
    const choices = choicesOfDay(day2);
    choices.splice(1, 0, {
      poiId: lake.id,
      kind: 'activity',
      mustDoId: null,
      note: null,
      lockedReason: 'user',
    });
    const outline = outlineOf(day2);
    const crowded = withDay({
      ...scheduleChoices(
        input,
        { ...outline, poiIds: [...outline.poiIds, lake.id] },
        choices,
        'by-hand',
      ),
      theme: day2.theme,
    });
    const before = validate(input, crowded);
    expect(before.violations.some((v) => v.dayNo === 2)).toBe(true);
    const settled = settle(input, [outline], crowded, before, { fillThin: false });
    const kept = settled.itinerary.days[1]?.items.find((item) => item.poi_id === lake.id);
    expect(kept?.locked_reason).toBe('user');
    expect(settled.dropped.map((d) => d.stableId)).not.toContain(kept?.stable_id);
  });
});
