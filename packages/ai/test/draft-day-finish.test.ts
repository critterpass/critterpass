/**
 * What the planner finishes once a day's stops are settled: a title that still matches the day, a
 * note where a ride is the day's long one or a meal has no place we know, variety in what it
 * picks itself, and a stop the organiser placed by hand left where it is.
 */
import type { Itinerary } from '@cp/domain';
import { choicesOfDay, foodRole, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { hopCap } from '../src/prompts/draft/areas';
import { fillMeals } from '../src/prompts/draft/complete-days';
import { buildDayRequest, scheduleChoices } from '../src/prompts/draft/day';
import { titleFits, titleFrom, withFittingTitles } from '../src/prompts/draft/day-titles';
import {
  LONG_RIDE_NOTE,
  NO_MEAL_NOTE,
  plannerLines,
  withFinalNotes,
} from '../src/prompts/draft/final-notes';
import { buildRedraftRequest } from '../src/prompts/draft/redraft';
import { settle } from '../src/prompts/draft/settle';
import { readsLocalNames, shownName } from '../src/prompts/draft/shown-names';
import type { SkeletonDay } from '../src/prompts/draft/skeleton';
import { validate } from '../src/prompts/draft/validate';
import { byVariety, kindOf, MAX_SAME_KIND, oneTooMany } from '../src/prompts/draft/variety';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
// The crew reads Vietnamese; these tests read the planner's English lines.
const { locale: _locale, ...input } = planInput(crew);
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
    expect(titleFits(input, { ...day2, theme: `A stop at ${first.name}` })).toBe(true);
    // A morning is over by early afternoon, and an evening has a stop in it.
    const ends = Math.max(...day2.items.map((item) => Date.parse(item.ends_at)));
    const late = ends > Date.parse(`${day2.date}T06:30:00Z`);
    expect(titleFits(input, { ...day2, theme: 'An easy morning' })).toBe(!late);
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
    const church = named('Đà Lạt Cathedral');
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
  const plain = input.pools.sights.filter((poi) => !poi.mustSee && foodRole(poi) === null);
  const temples = input.pools.sights.filter((poi) => poi.category === 'temple_shrine');
  const others = plain.filter((poi) => poi.category !== 'temple_shrine');

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

  it('takes a must-see first, then the kind the day lacks, then one the trip has not had', () => {
    const first = others[0] as DraftPoi;
    const same = others.find((poi) => kindOf(poi) === kindOf(first) && poi !== first) as DraftPoi;
    const fresh = others.find((poi) => kindOf(poi) !== kindOf(first)) as DraftPoi;
    const famous = input.pools.sights.find(
      (poi) => poi.mustSee && kindOf(poi) === kindOf(first),
    ) as DraftPoi;
    // The day holds one of `first`'s kind; the trip has had that kind only.
    const order = byVariety(input, [same, fresh, famous], [first.id], [first.id]);
    expect(order.map((poi) => poi.id)).toEqual([famous.id, fresh.id, same.id]);
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

describe('stops the organiser placed before the draft', { timeout: 60_000 }, () => {
  const held = CREWS.find((c) => c.id === 'dalat-held-1');
  if (held === undefined) throw new Error('no dalat-held-1 crew');
  const plan = planInput(held);
  const [lunch, pagoda] = (plan.held ?? []).map((stop) => stop.item);
  const outline: SkeletonDay = {
    dayNo: 2,
    date: plan.frame.dates[1] as string,
    theme: 'A day',
    area: 'the centre',
    mustDoIds: [],
    poiIds: [],
    mealIds: [],
    spareIds: [],
  };

  it('are told to the guide and kept out of what it is offered', () => {
    const text = JSON.stringify(buildDayRequest(plan, { day: outline, usedElsewhere: new Set() }));
    expect(text).toContain('Already on this day');
    expect(text).toContain('12:00–13:00 | Nem Nướng Bà Hùng | a meal');
    expect(text).toContain('This day needs dinner: one place for each.');
    expect(plan.pools.eateries.some((poi) => poi.id === lunch?.poi_id)).toBe(false);
    expect(plan.pools.sights.some((poi) => poi.id === pagoda?.poi_id)).toBe(false);
  });

  it('are on the day whatever the guide answers, and its stop at one of their places is not', () => {
    const sight = plan.pools.activities[0] as DraftPoi;
    const timed = scheduleChoices(
      plan,
      { ...outline, poiIds: [sight.id] },
      [
        { poiId: sight.id, kind: 'activity', mustDoId: null, note: null },
        { poiId: pagoda?.poi_id ?? '', kind: 'activity', mustDoId: null, note: 'again' },
      ],
      'around',
    );
    const kept = timed.items.filter((item) => item.locked_reason === 'user');
    expect(kept.map((item) => [item.stable_id, item.starts_at, item.ends_at])).toEqual(
      [lunch, pagoda].map((item) => [item?.stable_id, item?.starts_at, item?.ends_at]),
    );
    expect(timed.items.filter((item) => item.poi_id === pagoda?.poi_id)).toHaveLength(1);
    expect(timed.items.some((item) => item.poi_id === sight.id)).toBe(true);
    // Her lunch is the day's lunch: the planner adds a dinner and no second lunch.
    const whole: Itinerary = {
      currency: 'USD',
      days: plan.frame.dates.map((date, index) =>
        index === 1 ? timed : { day_no: index + 1, date, theme: 'A day', items: [] },
      ),
    };
    const fed = fillMeals(plan, [outline], whole).itinerary.days[1];
    const meals = (fed?.items ?? []).filter((item) => item.kind === 'meal');
    expect(meals.map((item) => item.stable_id)).toContain(lunch?.stable_id);
    expect(meals).toHaveLength(2);
  });
});

describe('a redraft for a reader of another language', () => {
  it('asks for her language, and says nothing when she reads English', () => {
    const request = (locale?: string) =>
      JSON.stringify(
        buildRedraftRequest({
          ...input,
          ...(locale === undefined ? {} : { locale }),
          base,
          dayNo: 2,
          reasons: ['slower'],
          note: null,
          chat: [],
        }),
      );
    expect(request('vi')).toContain('summary and note in Vietnamese (vi)');
    expect(request('en-GB')).not.toContain('summary and note in');
    expect(request()).not.toContain('summary and note in');
    expect(plannerLines('vi').longRide).not.toBe(plannerLines('en').longRide);
    expect(plannerLines('fr')).toBe(plannerLines(undefined));
  });
});

describe('a title is true to its day', { timeout: 60_000 }, () => {
  // A day with a lake before lunch and a waterfall after it.
  const lake = named('Xuân Hương Lake');
  const falls = named('Datanla Falls');
  const eatery = input.pools.eateries[0] as DraftPoi;
  const dayOf = (order: DraftPoi[]) =>
    scheduleChoices(
      input,
      {
        ...outlineOf(day2),
        mustDoIds: [],
        poiIds: order.filter((p) => p !== eatery).map((p) => p.id),
      },
      order.map((poi) => ({
        poiId: poi.id,
        kind: poi === eatery ? ('meal' as const) : ('activity' as const),
        mustDoId: null,
        note: null,
      })),
      'title',
    );
  // Timed by hand so the test says when each is: the lake at nine, lunch at noon, the falls at two.
  const timed = dayOf([lake, eatery, falls]);
  const hours: Record<string, [string, string]> = {
    [lake.id]: ['02:00', '03:00'],
    [eatery.id]: ['05:00', '06:00'],
    [falls.id]: ['07:00', '08:00'],
  };
  const lakeFirst = {
    ...timed,
    items: [lake, eatery, falls].map((poi, at) => {
      const item = timed.items.find((i) => i.poi_id === poi.id) as (typeof timed.items)[number];
      const [from, to] = hours[poi.id] as [string, string];
      return {
        ...item,
        starts_at: `${timed.date}T${from}:00.000Z`,
        ends_at: `${timed.date}T${to}:00.000Z`,
        travel_min: at === 0 ? 0 : 15,
      };
    }),
  };

  it('in the order it names things, and in the half of the day it puts them', () => {
    const fits = (theme: string) => titleFits(input, { ...lakeFirst, theme });
    expect(fits('Sáng hồ, chiều thác')).toBe(true);
    expect(fits('Sáng thác, chiều hồ')).toBe(false);
    expect(fits('Morning lake, afternoon waterfall')).toBe(true);
    expect(fits('Waterfall, then the lake')).toBe(false);
    // By name, in either language: Datanla is after Xuân Hương, not before.
    expect(fits('Xuân Hương and Datanla')).toBe(true);
    expect(fits('Datanla and Xuân Hương')).toBe(false);
    expect(fits('Hồ Xuân Hương và Thác Datanla')).toBe(true);
  });

  it('and calls a day easy only when no ride in it is long', () => {
    // The waterfall is the day's long visit: the title names it.
    expect(titleFits(input, { ...lakeFirst, theme: 'Chiều thác Đà Lạt nhẹ nhàng' })).toBe(
      lakeFirst.items.every((item) => item.travel_min <= 25),
    );
    const far = {
      ...lakeFirst,
      items: lakeFirst.items.map((item, at) => (at === 2 ? { ...item, travel_min: 33 } : item)),
    };
    expect(titleFits(input, { ...far, theme: 'Chiều thác Đà Lạt nhẹ nhàng' })).toBe(false);
    expect(titleFits(input, { ...far, theme: 'An easy day by the lake and the falls' })).toBe(
      false,
    );
    expect(titleFits(input, { ...far, theme: 'A day by the lake and the falls' })).toBe(true);
  });
});

describe('the name a place is shown under', () => {
  const valley = named('Valley of Love');

  it('is the local one for an organiser who reads the destination’s language', () => {
    expect(valley.nameLocal).toBe('Thung lũng Tình Yêu');
    const reader = (locale?: string, destinationLanguages: string[] = ['vi']) => ({
      ...(locale === undefined ? {} : { locale }),
      destinationLanguages,
    });
    expect(shownName(reader('vi'), valley)).toBe('Thung lũng Tình Yêu');
    expect(shownName(reader('vi-VN'), valley)).toBe('Thung lũng Tình Yêu');
    expect(shownName(reader('en'), valley)).toBe('Valley of Love');
    expect(shownName(reader(), valley)).toBe('Valley of Love');
    // A Vietnamese reader in Bali reads the English-first names: Indonesian is not hers.
    expect(shownName(reader('vi', ['id']), valley)).toBe('Valley of Love');
    expect(readsLocalNames(reader('pt', ['pt-BR']))).toBe(true);
    expect(shownName(reader('vi'), { name: 'Bicycle Up', nameLocal: null })).toBe('Bicycle Up');
    // A title written by code names places as she reads them.
    const title = titleFrom(
      { ...input, locale: 'vi' },
      {
        ...day2,
        items: day2.items
          .filter((item) => item.kind === 'activity')
          .slice(0, 1)
          .map((item) => ({ ...item, poi_id: valley.id })),
      },
    );
    // A long visit's day is named for it: "Buổi sáng ở Thung lũng Tình Yêu".
    expect(title).toContain('Thung lũng Tình Yêu');
    expect(title).not.toContain('Valley of Love');
  });
});
