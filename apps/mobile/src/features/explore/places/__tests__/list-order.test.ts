/**
 * The places list's order and rows: the sort line names the order the list is really in (fit only
 * when the server's ranking tells places apart, else the recommended order, else A–Z), the plan
 * filter lists stops day by day in the order the day runs, a place is a row once, and a raw
 * category opens the list on its group.
 */
import { describe, expect, it } from '@jest/globals';
import type { PlaceFit } from '@cp/domain';

import { listItems, planDays } from '../list-items';
import { areaOf, recommendedRank } from '../place-facts';
import { fitOrderKnown, listOrder, placeGroups } from '../place-groups';
import { filterParam } from '../register';
import type { HubPlace } from '../places-model';
import { dayColor, type PlanRouteDay } from '../plan-routes';
import { framePoints } from '../use-map-framing';

const place = (id: string, name: string, over: Partial<HubPlace> = {}): HubPlace => ({
  id,
  poiId: id,
  ideaId: null,
  name,
  category: 'food',
  lat: -8.5,
  lng: 115.26,
  standing: 'suggested',
  backerIds: [],
  dayNo: null,
  mustSee: false,
  hours: null,
  bestTime: null,
  ...over,
});

const fit = (grade: 'good' | 'possible' | 'no'): PlaceFit =>
  ({
    poi_id: 'x',
    version_id: 'v',
    best: grade === 'no' ? null : { day_id: 'd1', day_no: 1, grade, slot: null },
    days: [],
  }) as unknown as PlaceFit;

const places = [place('a', 'Aaharaam'), place('b', 'Babi Guling'), place('c', 'Cafe Wayan')];
const base = { places, filter: 'all' as const, fits: new Map<string, PlaceFit>(), from: null };

describe('the order the list is in', () => {
  it('is the fit order only when the ranking tells places apart', () => {
    const same = new Map([
      ['a', fit('good')],
      ['b', fit('good')],
    ]);
    const mixed = new Map([
      ['a', fit('good')],
      ['b', fit('possible')],
    ]);
    expect(fitOrderKnown(null, mixed)).toBe(false);
    expect(fitOrderKnown(['a', 'b'], same)).toBe(false);
    expect(fitOrderKnown(['a', 'b'], mixed)).toBe(true);
  });

  it('falls back to the recommended order, then to A–Z, and says which', () => {
    const ranks = new Map([
      ['c', 0],
      ['b', 11],
      ['a', 12],
    ]);
    expect(listOrder({ sort: 'fit', suggestOrder: null, fits: base.fits, ranks, from: null })).toBe(
      'picks',
    );
    expect(
      listOrder({ sort: 'fit', suggestOrder: null, fits: base.fits, ranks: new Map(), from: null }),
    ).toBe('az');
    expect(
      listOrder({ sort: 'nearest', suggestOrder: null, fits: base.fits, ranks, from: null }),
    ).toBe('az');
    const picks = placeGroups({ ...base, sort: 'fit', suggestOrder: null, ranks });
    expect(picks.suggests.map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
    const alphabet = placeGroups({ ...base, sort: 'fit', suggestOrder: null });
    expect(alphabet.suggests.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the recommended order when the ranking that answered orders nothing', () => {
    const fits = new Map([
      ['a', fit('good')],
      ['b', fit('good')],
    ]);
    const ranks = new Map([
      ['c', 0],
      ['b', 11],
      ['a', 12],
    ]);
    const groups = placeGroups({ ...base, fits, sort: 'fit', suggestOrder: ['a', 'b'], ranks });
    expect(groups.suggests.map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });

  it('ranks must-sees, then the curated set, then picks by rank', () => {
    expect(recommendedRank({ curation: 'editorial', pick_rank: null, must_see: true })).toBe(0);
    expect(recommendedRank({ curation: 'editorial', pick_rank: null, must_see: false })).toBe(1);
    expect(recommendedRank({ curation: 'auto', pick_rank: 1, must_see: false })).toBe(11);
    expect(recommendedRank({ curation: 'auto', pick_rank: null, must_see: false })).toBeNull();
  });
});

describe('the plan filter', () => {
  const planned = [
    place('t', 'Tirta Empul', { standing: 'plan', dayNo: 2 }),
    place('w', 'Warung', { standing: 'plan', dayNo: 1 }),
  ];
  const routes: PlanRouteDay[] = [
    { dayNo: 1, date: '2026-10-19', color: dayColor(1), stops: [stop('w', 1, 'Warung')] },
    {
      dayNo: 2,
      date: '2026-10-20',
      color: dayColor(1),
      stops: [stop('pin', 1, 'Breakfast at the villa'), stop('t', 2, 'Tirta Empul')],
    },
  ];
  function stop(id: string, n: number, name: string) {
    return { id, n, name, lat: -8.5, lng: 115.26 };
  }

  it('lists each day with its stops in the order the day runs, pins included', () => {
    const days = planDays(routes, planned);
    expect(days.map((day) => day.places.map((entry) => entry.name))).toEqual([
      ['Warung'],
      ['Breakfast at the villa', 'Tirta Empul'],
    ]);
    expect(days[1]?.places[0]?.poiId).toBeNull();
    const groups = placeGroups({
      ...base,
      places: planned,
      filter: 'plan',
      sort: 'fit',
      suggestOrder: null,
    });
    const items = listItems(groups, null, days);
    expect(items.map((item) => item.kind)).toEqual(['day', 'place', 'day', 'place', 'place']);
  });

  it('keeps one summary row under every other filter, and a place once', () => {
    const all = [...planned, ...places, place('a', 'Aaharaam')];
    const groups = placeGroups({ ...base, places: all, sort: 'az', suggestOrder: null });
    const items = listItems(groups, null);
    expect(items.filter((item) => item.kind === 'plan')).toHaveLength(1);
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('groups by day number before any stop has a spot', () => {
    expect(planDays([], planned).map((day) => day.dayNo)).toEqual([1, 2]);
  });
});

describe('ways in and the map frame', () => {
  it('opens a raw category on its group, and a filter key as it is', () => {
    expect(filterParam({ category: 'temple_shrine' })).toBe('temples');
    expect(filterParam({ category: 'market' })).toBe('food');
    expect(filterParam({ category: 'transit' })).toBeUndefined();
    expect(filterParam({ filter: 'saved', category: 'food' })).toBe('saved');
  });

  it('frames the filter’s places, not the crew’s, once a filter is chosen', () => {
    const far = place('f', 'Food far away', { lat: -8.8, lng: 115.1 });
    const temple = place('p', 'Pura', { category: 'temple_shrine', standing: 'saved' });
    const frame = framePoints([far, temple], 'food', null, false);
    expect(frame).toEqual([[115.1, -8.8]]);
    expect(framePoints([far, temple], 'saved', null, false)).toEqual([[115.26, -8.5]]);
    expect(framePoints([], 'saved', null, false)).toEqual([]);
  });

  it('reads an area from the address, never the street or the destination', () => {
    expect(areaOf('Jl. Hanoman 10, Ubud, Gianyar Regency, Bali 80571', 'Bali')).toBe('Ubud');
    expect(areaOf('Bali', 'Bali')).toBeNull();
    expect(areaOf(null, 'Bali')).toBeNull();
  });
});
