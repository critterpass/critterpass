/**
 * When a day begins: the long outdoor sight that is best early opens its day, sooner than the
 * crew's usual hour; a breakfast the crew asked for is followed by the first sight; and a lunch
 * across town between two neighbours is told from one on the way back to town.
 */
import { describe, expect, it } from 'vitest';

import {
  bestOrder,
  dayWindow,
  mealAcrossTown,
  opensDay,
  scheduleDay,
  startFloor,
  validateItinerary,
  type DayChoice,
} from '../../src/draft/index';
import { FRAME, P, POIS, TZ, id, line, place, stop } from './day-sense-fixture';

describe('when a day begins', () => {
  // Out of town: not in the grounds of anything in the centre.
  const peak = place(120, 'High Peak', 'nature', {
    durationMin: 180,
    bestTime: 'Early morning for clear views',
    lat: 16.2,
  });
  const grove = place(121, 'Pine Grove', 'nature', { bestTime: 'Early morning' });
  const pois = new Map([...POIS, [peak.id, peak], [grove.id, grove]]);
  const travel = line({
    home: 0,
    [P.museum.id]: 2,
    [P.lunch.id]: 5,
    [P.pagoda.id]: 10,
    [P.dinner.id]: 15,
    [grove.id]: 12,
    [peak.id]: 50,
  });
  const owls = { ...FRAME, chronotypes: { [id(900)]: 'night_owl' as const } };
  const window = dayWindow(owls, 1);
  const reach = { homeId: 'home', hopCapMin: 40, travel };
  const plan = (choices: DayChoice[]) => {
    const input = { date: owls.dates[1] as string, choices, pois, window, ...reach };
    const order = bestOrder(input).order;
    let next = 0;
    return scheduleDay({
      ...input,
      dayNo: 2,
      theme: 'A day',
      choices: order.map((index) => choices[index] as DayChoice),
      bands: null,
      currency: 'VND',
      tz: TZ,
      idFor: () => id(6000 + (next += 1)),
    });
  };
  const clock = (iso: string | undefined) =>
    new Date(iso ?? 0).toLocaleTimeString('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
    });

  it('knows the long or far outdoor sight that is best early', () => {
    expect(opensDay(peak, reach)).toBe(true);
    // Short and near: best early like everything else, and no more than that.
    expect(opensDay(grove, reach)).toBe(false);
    expect(opensDay({ ...grove, id: peak.id }, reach)).toBe(true);
    expect(opensDay({ ...peak, bestTime: 'Any time' }, reach)).toBe(false);
    expect(opensDay({ ...peak, category: 'museum' }, reach)).toBe(false);
    expect(startFloor(window, true, null)).toBe(8 * 60 + 30);
    expect(startFloor(window, false, null)).toBe(10 * 60);
    // The afternoon the crew lands does not open before it has landed.
    expect(startFloor(dayWindow(owls, 0), true, null)).toBe(14 * 60);
  });

  it('opens the day with it, before the night owls’ hour, whatever order the guide gave', () => {
    const day = plan([
      stop(P.museum),
      stop(P.lunch, 'meal'),
      stop(P.pagoda),
      stop(peak),
      stop(P.dinner, 'meal'),
    ]);
    expect(day.items[0]?.poi_id).toBe(peak.id);
    expect(clock(day.items[0]?.starts_at)).toBe('08:30');
    // Lunch is back in town after it, at lunch time.
    const lunch = day.items.find((item) => item.poi_id === P.lunch.id);
    expect(clock(lunch?.starts_at) <= '13:30').toBe(true);
    const found = validateItinerary({
      itinerary: { currency: 'VND', days: [day] },
      pois,
      frame: owls,
      travel,
      requiredMustDoIds: [],
      hopCapMin: 40,
      homeId: 'home',
    }).violations.map((v) => v.code);
    expect(found).toEqual([]);
    // Without the peak the day opens at ten as before.
    expect(clock(plan([stop(P.museum), stop(P.lunch, 'meal')]).items[0]?.starts_at)).toBe('10:00');
  });

  it('follows a breakfast the crew asked for with the first sight, not with a hole', () => {
    const breakfast: DayChoice = {
      ...stop(P.lunch, 'meal'),
      mustDoId: id(701),
      when: 'morning',
    };
    const asked = {
      ...owls,
      mustDos: [
        { id: id(701), ownerId: id(900), poiId: P.lunch.id, title: 'x', when: 'morning' as const },
      ],
    };
    const day = plan([breakfast, stop(P.museum), stop(P.pagoda)]);
    const [first, second] = day.items;
    expect(first?.poi_id).toBe(P.lunch.id);
    const gap = (Date.parse(second?.starts_at ?? '') - Date.parse(first?.ends_at ?? '')) / 60_000;
    expect(gap).toBeLessThanOrEqual(30);
    const found = validateItinerary({
      itinerary: { currency: 'VND', days: [day] },
      pois,
      frame: asked,
      travel,
      requiredMustDoIds: [],
    }).violations.map((v) => v.code);
    expect(found).not.toContain('DAY_OVERRUN');
    expect(found).not.toContain('FLIGHT_BUFFER');
  });

  it('tells a lunch across town between two neighbours from one on the way back to town', () => {
    const map = line({ falls: 0, monastery: 10, centre: 30, peak: 80, valley: 45 });
    expect(mealAcrossTown('falls', 'centre', 'monastery', map)).toBe(true);
    // From the peak back to town, then on to the valley: the lunch is on the way.
    expect(mealAcrossTown('peak', 'centre', 'valley', map)).toBe(false);
    expect(mealAcrossTown('falls', 'monastery', 'centre', map)).toBe(false);
  });
});
