/**
 * A day's drawn path joins its legs' road paths by their `from>to` keys, never by position: the
 * joint point two legs share is drawn once, and a leg without a road is a straight segment to the
 * next stop, with or without a stay at the ends.
 */
import { describe, expect, it } from '@jest/globals';

import { dayPath, type Coord, type RouteDay } from '../route-trace';

const STAY: Coord = [0, 0];
const stops: RouteDay['stops'] = [
  { id: 'item-a', legKey: 'a', n: 1, lng: 1, lat: 0 },
  { id: 'item-b', legKey: 'b', n: 2, lng: 2, lat: 0 },
];
const day = (legPaths?: ReadonlyMap<string, readonly Coord[]>): RouteDay => ({
  dayNo: 1,
  color: 'blue',
  stops,
  ...(legPaths === undefined ? {} : { legPaths }),
});

describe('dayPath', () => {
  it('draws straight segments when no leg has a road', () => {
    expect(dayPath(day(), STAY)).toEqual([STAY, [1, 0], [2, 0], STAY]);
    expect(dayPath(day(new Map()), null)).toEqual([
      [1, 0],
      [2, 0],
    ]);
  });

  it('follows the roads it has and joins them without repeating the shared point', () => {
    const legPaths = new Map<string, readonly Coord[]>([
      [
        'stay>a',
        [
          [0, 0.01],
          [0.5, 0.2],
          [1, 0.01],
        ],
      ],
      [
        'a>b',
        [
          [1, 0.01],
          [1.5, -0.2],
          [2, 0.01],
        ],
      ],
      // A road for a pair this day does not have is never drawn.
      ['stay>b', [[9, 9]]],
    ]);
    expect(dayPath(day(legPaths), STAY)).toEqual([
      STAY,
      [0, 0.01],
      [0.5, 0.2],
      [1, 0.01],
      [1.5, -0.2],
      [2, 0.01],
      // b>stay has no road yet: straight back from where the last road ended.
      STAY,
    ]);
  });

  it('mixes a missing leg between roads, and matches a stop by its id without a leg key', () => {
    const legPaths = new Map<string, readonly Coord[]>([
      [
        'item-a>item-b',
        [
          [1, 0.01],
          [1.5, 0.3],
          [2, 0.01],
        ],
      ],
    ]);
    const keyless: RouteDay = {
      dayNo: 2,
      color: 'pink',
      stops: stops.map(({ id, n, lng, lat }) => ({ id, n, lng, lat })),
      legPaths,
    };
    expect(dayPath(keyless, null)).toEqual([
      [1, 0],
      [1, 0.01],
      [1.5, 0.3],
      [2, 0.01],
    ]);
    expect(dayPath(keyless, STAY)).toEqual([STAY, [1, 0], [1, 0.01], [1.5, 0.3], [2, 0.01], STAY]);
  });
});
