import { describe, expect, it } from '@jest/globals';

import { starredList, type MustDoRow } from '../use-must-do-stars';

const row = (over: Partial<MustDoRow>): MustDoRow => ({
  id: 'm1',
  owner_id: 'me',
  poi_id: 'p1',
  title: 'Tirta Empul',
  priority: 0,
  ...over,
});

describe('starring a must-do on Ideas', () => {
  it('makes the place my one primary must-do and drops the old star, keeping my extras', () => {
    const mine = [row({}), row({ id: 'm2', poi_id: 'p2', title: 'Rice terraces', priority: 1 })];
    expect(starredList(mine, { poiId: 'p3', name: 'Ubud market' })).toEqual([
      { poi_id: 'p3', text: 'Ubud market', priority: 0 },
      { id: 'm2', poi_id: 'p2', text: 'Rice terraces', priority: 1 },
    ]);
  });

  it('takes my star off when I tap my own starred place again', () => {
    const mine = [row({}), row({ id: 'm2', poi_id: null, title: 'Sunrise hike', priority: 1 })];
    expect(starredList(mine, { poiId: 'p1', name: 'Tirta Empul' })).toEqual([
      { id: 'm2', text: 'Sunrise hike', priority: 1 },
    ]);
  });

  it('promotes an extra to the star without listing it twice', () => {
    const mine = [row({ id: 'm2', poi_id: 'p2', title: 'Rice terraces', priority: 1 })];
    expect(starredList(mine, { poiId: 'p2', name: 'Rice terraces' })).toEqual([
      { poi_id: 'p2', text: 'Rice terraces', priority: 0 },
    ]);
  });
});
