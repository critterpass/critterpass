/**
 * The one-tap fix of a clash stays close to the day as it was: the nearest start in the same part
 * of the day, then the two stops swapped, then the nearest start that day; and never an hour the
 * place is not for.
 */
import { describe, expect, it } from 'vitest';

import { settleClash, suitsPlace, type MovedStop } from '../../src/check/index';
import type { FitDay, FitTravel } from '../../src/fit/context';
import type { DayModel, ModelItem } from '../../src/fit/day-model';

const CREW = new Set(['a', 'b']);
const stop = (stableId: string, from: string, to: string, locked = false): ModelItem => {
  const minute = (time: string) => {
    const [h = 0, m = 0] = time.split(':').map(Number);
    return h * 60 + m;
  };
  return { stableId, start: minute(from), end: minute(to), people: CREW, locked, point: null };
};
const model = (...items: ModelItem[]): DayModel => ({
  day: { dayId: 'd', dayNo: 2, date: '2026-10-20' } as FitDay,
  items,
  everyone: [...CREW],
});
const noTravel: FitTravel = () => null;
const SIGHT: MovedStop = { category: 'activity', outdoor: false, darkFromMin: 18 * 60 + 30 };
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const fix = (
  day: DayModel,
  first: ModelItem,
  second: ModelItem,
  what: Readonly<Record<string, MovedStop>> = {},
) =>
  settleClash(day, first, second, noTravel, (item) => ({
    spans: null,
    what: what[item.stableId] ?? SIGHT,
  }))?.map((move) => `${move.item.stableId}@${clock(move.start)}`) ?? null;

describe('settling a clash', () => {
  // A full day: the temple was put at 11:45, on top of the museum that runs to 12:15.
  const museum = stop('museum', '10:45', '12:15');
  const temple = stop('temple', '11:45', '12:30');
  const lunch = stop('lunch', '12:45', '13:45');
  const afternoon = [stop('lake', '14:00', '15:30'), stop('market', '15:45', '17:15')];
  const evening = [stop('dinner', '18:00', '19:30')];

  it('swaps the two when that keeps each at an hour its place is for', () => {
    // The garden must be done by dark: after the gallery it would not be, before it it is.
    const gallery = stop('gallery', '17:00', '18:15');
    const garden = stop('garden', '17:30', '18:30');
    const day = model(stop('lake', '15:00', '17:00'), gallery, garden);
    const what = { garden: { ...SIGHT, outdoor: true } };
    expect(fix(day, gallery, garden, what)).toEqual(['garden@17:00', 'gallery@18:00']);
    // Indoors, it simply follows the gallery.
    expect(fix(day, gallery, garden)).toEqual(['garden@18:15']);
  });

  it('else takes the nearest start in its part of the day, then in the day: never the first free evening hour', () => {
    // Lunch at a quarter to one leaves no room for the swap: the temple opens the morning.
    const packed = model(
      stop('walk', '09:00', '10:30'),
      museum,
      temple,
      lunch,
      ...afternoon,
      ...evening,
    );
    expect(fix(packed, museum, temple)).toEqual(['temple@08:15']);
    // With the whole morning taken, the gap before dinner is nearer than the hour after it.
    const early = stop('hike', '06:00', '10:30', true);
    const full = model(early, museum, temple, lunch, ...afternoon, ...evening);
    expect(fix(full, museum, temple)).toEqual(['temple@17:15']);
  });

  it('goes right after the stop it ran into when that is the nearest free start', () => {
    const day = model(stop('walk', '09:00', '10:30'), museum, temple, ...evening);
    expect(fix(day, museum, temple)).toEqual(['temple@12:15']);
  });

  it('keeps a lunch a lunch and a stop in the open air out of the dark', () => {
    const what = { picnic: { ...SIGHT, category: 'meal' } };
    const picnic = stop('picnic', '12:00', '13:00');
    const tour = stop('tour', '11:00', '14:30', true);
    const rest = [stop('show', '14:30', '18:00', true), stop('late', '18:00', '21:00', true)];
    // Every lunch hour is taken by stops that cannot move: no one-tap fix, rather than a lunch at nine at night.
    expect(fix(model(tour, picnic, ...rest), tour, picnic, what)).toBeNull();
    // The same clash for a museum visit takes the hour before the tour.
    expect(fix(model(tour, picnic, ...rest), tour, picnic)).toEqual(['picnic@10:00']);

    const garden = stop('garden', '16:00', '17:30');
    const outdoors = { ...SIGHT, outdoor: true };
    expect(suitsPlace(garden, outdoors, 17 * 60)).toBe(true);
    expect(suitsPlace(garden, outdoors, 17 * 60 + 30)).toBe(false);
    expect(suitsPlace(stop('bar', '20:00', '21:30'), outdoors, 21 * 60)).toBe(true);
    expect(suitsPlace(picnic, what.picnic, 13 * 60 + 30)).toBe(true);
    expect(suitsPlace(picnic, what.picnic, 18 * 60)).toBe(false);
  });

  it('never moves a locked stop: the other one moves instead', () => {
    const booked = stop('temple', '11:45', '12:30', true);
    const day = model(museum, booked, ...evening);
    expect(fix(day, museum, booked)).toEqual(['museum@10:15']);
  });
});
