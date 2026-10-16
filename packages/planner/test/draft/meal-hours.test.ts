/**
 * Meals at local hours: a crew in Madrid lunches at half past one and dines at half past eight,
 * not at noon and six, and a crew flying out in the evening has dinner before the airport.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import type { FitPlace } from '../../src/fit/context';
import { kindWindows } from '../../src/fit/kind-time';
import {
  dayWindow,
  mealAt,
  mealHoursIn,
  mealsInWindow,
  minuteOfDate,
  USUAL_MEALS,
  type DraftPoi,
  type TripFrame,
} from '../../src/draft/index';
import { codes, drafted, FRAME, P, POIS, stop } from './day-sense-fixture';

const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Each meal of the day's plan as `name@hh:mm–hh:mm`, in local time. */
function meals(plan: Itinerary, pois: ReadonlyMap<string, DraftPoi> = POIS): string[] {
  const day = plan.days[0];
  return (day?.items ?? [])
    .filter((item) => item.kind === 'meal')
    .map((item) => {
      const at = (iso: string) => clock(minuteOfDate(new Date(iso), day?.date ?? '', item.tz));
      return `${pois.get(item.poi_id ?? '')?.name ?? ''}@${at(item.starts_at)}–${at(item.ends_at)}`;
    });
}

const inZone = (tz: string, extra: Partial<TripFrame> = {}): TripFrame => ({
  ...FRAME,
  tz,
  ...extra,
});
const PLACES_TZ = P.museum.tz;

describe('local meal hours', () => {
  it('reads the dining hours of the destination from its time zone', () => {
    const dinner = (tz: string) => clock(mealHoursIn(tz).dinner.startMin);
    const lunch = (tz: string) => clock(mealHoursIn(tz).lunch.startMin);
    expect(dinner('Europe/Madrid')).toBe('20:30');
    expect(lunch('Europe/Madrid')).toBe('13:30');
    expect(dinner('Europe/Lisbon')).toBe('19:30');
    expect(dinner('Europe/Istanbul')).toBe('19:30');
    expect(lunch('America/Mexico_City')).toBe('13:00');
    expect(dinner('America/Argentina/Buenos_Aires')).toBe('20:30');
    expect(dinner('Europe/London')).toBe('19:00');
    expect(mealHoursIn('Asia/Ho_Chi_Minh')).toBe(USUAL_MEALS);
    expect(mealHoursIn('America/New_York')).toBe(USUAL_MEALS);
  });

  it('counts a meal by the local stretches: six in Madrid is between meals', () => {
    const madrid = mealHoursIn('Europe/Madrid');
    expect(mealAt(14 * 60 + 30, madrid)).toBe('lunch');
    expect(mealAt(18 * 60, madrid)).toBeNull();
    expect(mealAt(21 * 60 + 30, madrid)).toBe('dinner');
    expect(mealAt(18 * 60, USUAL_MEALS)).toBe('dinner');
  });

  it('times a Madrid day at Madrid hours, and its checks agree', () => {
    const madrid = inZone('Europe/Madrid');
    const there = new Map([...POIS].map(([key, poi]) => [key, { ...poi, tz: madrid.tz }]));
    const choices = [
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.pagoda),
      stop(P.park),
      stop(P.dinner, 'meal'),
    ];
    const plan = drafted(1, choices, madrid, false, there);
    const [lunch = '', dinner = ''] = meals(plan, there).map((meal) => meal.split('@')[1] ?? '');
    expect(lunch >= '13:30' && lunch <= '15:00').toBe(true);
    expect(dinner >= '20:30').toBe(true);
    expect(codes(plan, madrid, there)).toEqual([]);
    // The same day in Vietnam dines at six.
    const home = drafted(1, choices);
    expect(meals(home)[1]).toContain('@18:00');
  });

  it('suggests a restaurant for the local lunch and dinner when a stop is added by hand', () => {
    const restaurant: FitPlace = {
      poiId: P.lunch.id,
      name: 'Casa Lucio',
      category: 'food',
      point: { lat: 40.41, lng: -3.71 },
      hours: null,
      outdoor: false,
    };
    const { own } = kindWindows(restaurant, FRAME.dates[1] ?? '', 'Europe/Madrid', 75);
    expect(own.map((w) => `${clock(w.fromMin)}–${clock(w.toMin)}`)).toEqual([
      '13:30–14:30',
      '20:30–21:30',
    ]);
  });
});

describe('the day the crew flies out in the evening', () => {
  const last = FRAME.dates.length - 1;

  it('has dinner before the airport when the flight leaves at half past nine', () => {
    const flying = inZone(PLACES_TZ, { departureMin: 21 * 60 + 30 });
    const window = dayWindow(flying, last);
    expect(window.endMin).toBe(18 * 60 + 30);
    expect(mealsInWindow(window)).toEqual(['lunch', 'dinner']);
    const plan = drafted(
      last,
      [stop(P.museum), stop(P.lunch, 'meal'), stop(P.pagoda), stop(P.dinner, 'meal')],
      flying,
    );
    expect(meals(plan)[1]).toBe('Bánh Xèo Bà Dưỡng@17:00–18:00');
    expect(codes(plan, flying)).not.toContain('MEAL_OFF_HOURS');
    expect(codes(plan, flying)).not.toContain('DAY_OVERRUN');
  });

  it('dines early in Madrid too, and not at all before an afternoon flight', () => {
    const madrid = dayWindow(inZone('Europe/Madrid', { departureMin: 21 * 60 + 30 }), last);
    expect(madrid.meals?.dinner.startMin).toBe(17 * 60);
    const afternoon = dayWindow(inZone(PLACES_TZ, { departureMin: 19 * 60 + 30 }), last);
    expect(mealsInWindow(afternoon)).toEqual(['lunch']);
    // A late flight leaves the usual dinner as it is.
    const late = dayWindow(inZone(PLACES_TZ, { departureMin: 23 * 60 }), last);
    expect(late.meals).toBe(USUAL_MEALS);
  });
});
