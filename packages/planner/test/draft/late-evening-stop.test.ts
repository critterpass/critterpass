/**
 * A night out after a late local dinner: in Madrid the crew dines at half past eight and the bar
 * comes after, running until the local night ends. Only a place for the night runs that late, it
 * never runs past the place's closing, and where dinner is at six the night ends earlier.
 */
import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { minuteOfDate, type DraftPoi, type TripFrame } from '../../src/draft/index';
import { codes, drafted, FRAME, P, POIS, place, stop } from './day-sense-fixture';

const MADRID: TripFrame = { ...FRAME, tz: 'Europe/Madrid' };
const inMadrid = (pois: ReadonlyMap<string, DraftPoi>) =>
  new Map([...pois].map(([key, poi]) => [key, { ...poi, tz: MADRID.tz }]));

/** Each stop of the day as [name, start, end] in local minutes. */
function times(plan: Itinerary, pois: ReadonlyMap<string, DraftPoi>, tz: string) {
  const day = plan.days[0];
  return (day?.items ?? []).map((item) => {
    const at = (iso: string) => minuteOfDate(new Date(iso), day?.date ?? '', tz);
    return [pois.get(item.poi_id ?? '')?.name, at(item.starts_at), at(item.ends_at)] as const;
  });
}

const DAY = [stop(P.museum), stop(P.lunch, 'meal'), stop(P.park), stop(P.dinner, 'meal')];

describe('a night out after a late local dinner', () => {
  it('follows dinner and may run past ten where the night runs later', () => {
    const there = inMadrid(POIS);
    const plan = drafted(1, [...DAY, stop(P.bar)], MADRID, true, there);
    const timed = times(plan, there, MADRID.tz);
    const dinner = timed.find(([name]) => name === P.dinner.name);
    const bar = timed.find(([name]) => name === P.bar.name);
    expect(dinner?.[1]).toBeGreaterThanOrEqual(20 * 60 + 30);
    expect(bar?.[1]).toBeGreaterThanOrEqual(dinner?.[2] ?? Infinity);
    expect(bar?.[2]).toBeGreaterThan(22 * 60);
    expect(codes(plan, MADRID, there)).toEqual([]);
  });

  it('keeps any other stop inside the usual day', () => {
    const shops = place(30, 'Gran Vía Shops', 'shopping');
    const there = inMadrid(new Map([...POIS, [shops.id, shops]]));
    const plan = drafted(1, [...DAY, stop(shops)], MADRID, true, there);
    expect(codes(plan, MADRID, there)).toContain('DAY_OVERRUN');
  });

  it('never runs past the place closing', () => {
    const closes = {
      weekly: Object.fromEntries(
        ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [
          d,
          [{ start: '18:00', end: '22:30' }],
        ]),
      ),
    } as DraftPoi['hours'];
    const there = inMadrid(new Map([...POIS, [P.bar.id, { ...P.bar, hours: closes }]]));
    const plan = drafted(1, [...DAY, stop(P.bar)], MADRID, false, there);
    const bar = times(plan, there, MADRID.tz).find(([name]) => name === P.bar.name);
    expect(bar?.[2]).toBeLessThanOrEqual(22 * 60 + 30);
    expect(codes(plan, MADRID, there)).not.toContain('CLOSED_AT_TIME');
  });

  it('ends earlier where dinner is at six', () => {
    const long = { ...P.bar, durationMin: 4 * 60 };
    const pois = new Map([...POIS, [long.id, long]]);
    const plan = drafted(1, [...DAY, stop(long)], FRAME, true, pois);
    const bar = times(plan, pois, FRAME.tz).find(([name]) => name === P.bar.name);
    expect(bar?.[2]).toBeGreaterThan(22 * 60 + 30);
    expect(codes(plan, FRAME, pois)).toContain('DAY_OVERRUN');
  });
});
