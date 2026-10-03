import { describe, expect, it } from '@jest/globals';

import { edgePlacement } from '../edge-position';
import { placeDotFeatures, pressedPlaceId, type PlaceDot } from '../place-dots';
import { routeFeatures, traceLine, type Coord, type RouteDay } from '../route-trace';
import { boundsOf } from '../use-planning-camera';

const LINE: Coord[] = [
  [0, 0],
  [1, 0],
  [2, 0],
];

describe('traceLine', () => {
  it('starts as the first point twice and ends as the whole line', () => {
    expect(traceLine(LINE, 0)).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(traceLine(LINE, 1)).toEqual(LINE);
  });

  it('cuts a segment part way by length', () => {
    expect(traceLine(LINE, 0.5)).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const quarter = traceLine(LINE, 0.25);
    expect(quarter).toHaveLength(2);
    expect(quarter[1]?.[0]).toBeCloseTo(0.5);
  });

  it('keeps a one-point or empty path drawable', () => {
    expect(traceLine([[3, 4]], 0.5)).toEqual([
      [3, 4],
      [3, 4],
    ]);
    expect(traceLine([], 0.5)).toEqual([]);
  });
});

describe('routeFeatures', () => {
  const days: RouteDay[] = [
    { dayNo: 2, color: 'pink', stops: [{ id: 'a', n: 1, lng: 1, lat: 1 }] },
    {
      dayNo: 3,
      color: 'blue',
      stops: [
        { id: 'b', n: 1, lng: 2, lat: 2 },
        { id: 'c', n: 2, lng: 3, lat: 3 },
      ],
    },
  ];

  it('runs each day from the stay and back, the chosen day last and at full strength', () => {
    const { lines, stops } = routeFeatures(days, 3, [0, 0]);
    expect(lines.features.map((f) => f.properties.color)).toEqual(['pink', 'blue']);
    expect(lines.features[1]?.geometry.coordinates).toEqual([
      [0, 0],
      [2, 2],
      [3, 3],
      [0, 0],
    ]);
    expect(lines.features.map((f) => f.properties.opacity)).toEqual([0.5, 1]);
    expect(stops.features.map((f) => [f.properties.label, f.properties.chosen])).toEqual([
      ['1', false],
      ['1', true],
      ['2', true],
    ]);
  });

  it('draws every day at full strength for the whole trip and traces only the chosen day', () => {
    expect(
      routeFeatures(days, null, null).lines.features.every((f) => f.properties.opacity === 1),
    ).toBe(true);
    const tracing = routeFeatures(days, 3, [0, 0], 0);
    expect(tracing.lines.features[1]?.geometry.coordinates).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(tracing.lines.features[0]?.geometry.coordinates).toHaveLength(3);
  });
});

describe('edgePlacement', () => {
  const bounds = [115.2, -8.55, 115.3, -8.45] as const;
  const size = { width: 400, height: 800 };
  const margin = { top: 100, bottom: 300, side: 60 };

  it('is null for a stop on screen above the sheet', () => {
    expect(edgePlacement(115.25, -8.48, bounds, size, margin)).toBeNull();
  });

  it('puts a stop beyond the left or right edge on that side, level with it', () => {
    const left = edgePlacement(115.13, -8.48, bounds, size, margin);
    expect(left?.side).toBe('left');
    expect(left?.along).toBeGreaterThan(100);
    expect(left?.along).toBeLessThan(500);
    expect(edgePlacement(115.4, -8.6, bounds, size, margin)).toEqual({ side: 'right', along: 500 });
  });

  it('treats a stop under the sheet as off screen at the foot', () => {
    expect(edgePlacement(115.25, -8.54, bounds, size, margin)?.side).toBe('bottom');
    expect(edgePlacement(115.25, -8.4, bounds, size, margin)?.side).toBe('top');
  });
});

describe('place dots', () => {
  const place = (id: string, extra: Partial<PlaceDot>): PlaceDot => ({
    id,
    lat: 0,
    lng: 0,
    tier: 'suggested',
    iconKey: 'pin-food',
    relevance: 1,
    ...extra,
  });

  it('splits saved places from suggestions and dims what the filter leaves out', () => {
    const places = [
      place('a', { tier: 'saved', badgeColor: 'pink', relevance: 9 }),
      place('b', { dimmed: true }),
      place('c', {}),
    ];
    const saved = placeDotFeatures(places, 'saved').features;
    expect(saved.map((f) => [f.properties.id, f.properties.weight, f.properties.hasBadge])).toEqual(
      [['a', 3, true]],
    );
    const suggested = placeDotFeatures(places, 'suggested').features;
    expect(suggested.map((f) => [f.properties.id, f.properties.lit])).toEqual([
      ['b', 0],
      ['c', 1],
    ]);
  });

  it('reads the pressed place and never a cluster', () => {
    expect(pressedPlaceId([{ properties: { cluster: true, cluster_id: 4 } }])).toBeNull();
    expect(pressedPlaceId([{ properties: null }, { properties: { id: 'p1' } }])).toBe('p1');
  });

  it('boxes the points a camera fits, with room around a single one', () => {
    expect(boundsOf([])).toBeNull();
    expect(
      boundsOf([
        [1, 2],
        [3, -1],
      ]),
    ).toEqual([1, -1, 3, 2]);
    const single = boundsOf([[1, 2]]);
    expect(single?.[0]).toBeLessThan(1);
    expect(single?.[2]).toBeGreaterThan(1);
  });
});
