/** The must-dos offered on an empty list: the guide's top places, with something to eat among them. */
import { describe, expect, it } from '@jest/globals';

import { examplePlaces, type ExamplePlaceRow } from '../examples';

const row = (id: string, category: string, local: string | null = null): ExamplePlaceRow => ({
  id,
  name: id,
  name_local: local,
  category,
});

describe('example must-dos', () => {
  const rows = [
    row('Crazy House', 'other', 'Biệt thự Hằng Nga'),
    row('Datanla Falls', 'nature'),
    row('Linh Phuoc Pagoda', 'temple_shrine'),
    row('Banh can Nha Chung', 'food', 'Bánh căn Nhà Chung'),
    row('Ana Mandara', 'stay'),
  ];

  it('offers the two top sights and the best place to eat', () => {
    expect(examplePlaces(rows, false).map((place) => place.name)).toEqual([
      'Crazy House',
      'Datanla Falls',
      'Banh can Nha Chung',
    ]);
  });

  it('uses the place’s own name for a reader of its language', () => {
    expect(examplePlaces(rows, true).map((place) => place.name)).toEqual([
      'Biệt thự Hằng Nga',
      'Datanla Falls',
      'Bánh căn Nhà Chung',
    ]);
  });

  it('never offers a stay as a must-do', () => {
    const names = examplePlaces([rows[4]!, rows[0]!], false).map((place) => place.name);
    expect(names).toEqual(['Crazy House']);
  });

  it('fills from what there is, and offers nothing without places', () => {
    expect(examplePlaces(rows.slice(0, 2), false)).toHaveLength(2);
    expect(examplePlaces([], true)).toEqual([]);
  });
});
