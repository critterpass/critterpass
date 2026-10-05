/**
 * The time of day a place is for (a bar after dark, a temple by daylight, the morning only as a
 * preference) and what counts as a meal: a snack is no dinner, and the dish of a must-do is one
 * visit, not a theme.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  dayWindow,
  foodRole,
  mealDuration,
  placeTime,
  placeWindow,
  scheduleDay,
  sharesDish,
  validateItinerary,
  type DayChoice,
  type DraftPoi,
} from '../../src/draft/index';
import {
  FRAME,
  P,
  POIS,
  TZ,
  codes,
  drafted,
  id,
  line,
  names,
  place,
  stop,
} from './day-sense-fixture';

describe('the time of day a place is for', () => {
  const date = FRAME.dates[1] as string;

  it('holds a bar to after dark and a sunset beach to the sunset', () => {
    expect(placeTime(P.bar)).toBe('after_dark');
    expect(placeWindow(P.bar, date)?.fromMin).toBeGreaterThanOrEqual(17 * 60 + 30);
    expect(placeTime(P.beach)).toBe('sunset');
    const sunset = placeWindow(P.beach, date);
    expect(sunset?.fromMin).toBeGreaterThanOrEqual(15 * 60);
    expect(sunset?.toMin).toBeLessThanOrEqual(19 * 60);
  });

  it('keeps daylight places out of the night, and leaves a square alone', () => {
    const sunset = placeWindow(P.pagoda, date);
    expect(sunset?.fromMin).toBe(0);
    expect(sunset?.toMin).toBeGreaterThanOrEqual(16 * 60);
    expect(sunset?.toMin).toBeLessThanOrEqual(19 * 60);
    expect(placeWindow(P.museum, date)?.toMin).toBe(sunset?.toMin);
    expect(placeWindow(place(30, 'Town Square', 'other'), date)).toBeNull();
    // The guide put the pagoda after dinner; the planner brings it back into the day.
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.dinner, 'meal'),
      stop(P.pagoda),
    ]);
    expect(names(plan)).toEqual([P.museum.name, P.lunch.name, P.pagoda.name, P.dinner.name]);
    // Left after dinner, it is a place at the wrong time of day.
    const asGiven = drafted(
      1,
      [stop(P.museum), stop(P.lunch, 'meal'), stop(P.dinner, 'meal'), stop(P.pagoda)],
      FRAME,
      true,
    );
    expect(codes(asGiven)).toContain('WRONG_TIME_OF_DAY');
  });

  it('keeps the morning a preference: no morning window, but first in the order of the day', () => {
    expect(placeTime(P.terraces)).toBe('morning');
    expect(placeWindow(P.terraces, date)?.fromMin).toBe(0);
    // Better in the morning is at least by daylight, whatever the place is filed as.
    expect(placeWindow({ ...P.terraces, category: 'museum' }, date)?.toMin).toBeLessThan(19 * 60);
    // The guide put the terraces after lunch; the planner moves them into the morning.
    const plan = drafted(1, [
      stop(P.museum),
      stop(P.pagoda),
      stop(P.lunch, 'meal'),
      stop(P.terraces),
      stop(P.dinner, 'meal'),
    ]);
    const terraces = plan.days[0]?.items.find((item) => item.poi_id === P.terraces.id);
    const lunch = plan.days[0]?.items.find((item) => item.poi_id === P.lunch.id);
    expect(Date.parse(terraces?.starts_at ?? '')).toBeLessThanOrEqual(
      Date.parse('2026-10-20T04:00:00Z'),
    );
    expect(Date.parse(terraces?.starts_at ?? '')).toBeLessThan(Date.parse(lunch?.starts_at ?? ''));
    expect(codes(plan)).toEqual([]);
  });

  it('lets a morning place fill an afternoon when the morning is taken', () => {
    const late = drafted(0, [stop(P.terraces), stop(P.dinner, 'meal')]);
    // The first day starts at two: the terraces are planned then, and nothing is broken.
    expect(names(late)).toEqual([P.terraces.name, P.dinner.name]);
    expect(codes(late)).toEqual([]);
  });

  it('sends nobody to a bar in the morning', () => {
    const plan = drafted(1, [
      stop(P.bar),
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.dinner, 'meal'),
    ]);
    expect(names(plan)).toEqual([P.museum.name, P.lunch.name, P.dinner.name, P.bar.name]);
  });
});

describe('food', () => {
  const shop = (n: number, name: string, extra: Partial<DraftPoi> = {}) =>
    place(n, name, 'food', extra);

  it('takes a twenty-minute counter stop for a snack, a sit-down place for a meal', () => {
    expect(foodRole(shop(40, 'Bánh Mì 47', { durationMin: 15, tags: ['street_food'] }))).toBe(
      'light',
    );
    expect(foodRole(shop(41, 'Chè Hé', { durationMin: 20 }))).toBe('light');
    expect(foodRole(shop(42, 'Nem Nướng Bà Hùng', { durationMin: 45 }))).toBe('meal');
    expect(foodRole(shop(43, 'Quán Ngon', { durationMin: 20, tags: ['sit_down_dining'] }))).toBe(
      'meal',
    );
  });

  it('gives a sit-down dinner an hour, and leaves a noodle counter its own time', () => {
    const table = shop(49, 'Nhà hàng Hoa Sữa', { durationMin: 30, tags: ['sit_down_dining'] });
    const counter = shop(50, 'Hủ Tíu Hồng', { durationMin: 30, tags: ['street_food'] });
    expect(mealDuration(table, 18 * 60, 30)).toBe(60);
    expect(mealDuration(table, 12 * 60, 30)).toBe(30);
    expect(mealDuration(counter, 18 * 60, 30)).toBe(30);
    expect(mealDuration({ ...table, durationMin: 90 }, 19 * 60, 90)).toBe(90);
  });

  it('knows a dish wherever the name carries it', () => {
    const chip = shop(44, 'Chip Chip - bánh căn');
    const yen = shop(45, 'Bánh Căn Nhà Yến');
    expect(sharesDish(chip, yen)).toBe(true);
    expect(sharesDish(yen, shop(46, 'Bánh Canh Cua Má Ba'))).toBe(false);
  });

  it('serves the dish of a must-do once in the trip', () => {
    const wish = shop(47, 'Chip Chip - bánh căn', { durationMin: 30 });
    const other = shop(48, 'Bánh Căn Nhà Yến', { durationMin: 30 });
    const pois = new Map([...POIS, [wish.id, wish], [other.id, other]]);
    const positions = line({ [wish.id]: 2, [other.id]: 4, [P.museum.id]: 0, [P.pagoda.id]: 10 });
    const day = (dayIndex: number, choices: readonly DayChoice[]) => {
      let next = 0;
      return scheduleDay({
        dayNo: dayIndex + 1,
        date: FRAME.dates[dayIndex] as string,
        theme: 'A day',
        choices,
        pois,
        window: dayWindow(FRAME, dayIndex),
        travel: positions,
        bands: null,
        currency: 'VND',
        tz: TZ,
        idFor: () => id(2000 + dayIndex * 10 + (next += 1)),
      });
    };
    const plan: Itinerary = {
      currency: 'VND',
      days: [
        day(1, [{ poiId: wish.id, kind: 'meal', mustDoId: id(700), note: null }, stop(P.museum)]),
        // Two days on, the dish again: not a repeat on neighbouring days, but the must-do's dish.
        day(2, [stop(P.pagoda), { poiId: other.id, kind: 'meal', mustDoId: null, note: null }]),
      ],
    };
    const found = validateItinerary({
      itinerary: plan,
      pois,
      frame: FRAME,
      travel: positions,
      requiredMustDoIds: [],
    }).violations.filter((v) => v.code === 'REPEAT_DISH');
    expect(found.map((v) => v.poiId)).toEqual([other.id]);
  });
});
