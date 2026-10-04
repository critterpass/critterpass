/**
 * Tokek's dots gather into count bubbles until street zoom, and the dots left alone are far enough
 * apart never to gather again; saved icons never gather. The plan's days become numbered routes
 * in time order, and the map leads with the picked stop's day, else today's, else the first.
 */
import { describe, expect, it } from '@jest/globals';

import { STREET_ZOOM, type PlaceDot } from '@/ui/map/planning/place-dots';

import { GATHER_PX, gatherDots } from '../place-clusters';
import { leadDay, openingFrame, routeDays } from '../plan-routes';

const dot = (id: string, lat: number, lng: number, extra: Partial<PlaceDot> = {}): PlaceDot => ({
  id,
  lat,
  lng,
  tier: 'suggested',
  iconKey: 'pin-other',
  relevance: 1,
  ...extra,
});

// Near Ubud: four dots a few dozen metres apart, one 10 km away, one saved icon among them.
const DOTS = [
  dot('a', -8.5069, 115.2625, { relevance: 2 }),
  dot('b', -8.5071, 115.2627),
  dot('c', -8.5066, 115.2622, { dimmed: true }),
  dot('d', -8.5073, 115.2629, { dimmed: true }),
  dot('far', -8.42, 115.31),
  dot('saved', -8.507, 115.2626, { tier: 'saved' }),
];

describe('gathering Tokek dots', () => {
  it('gathers close dots into one bubble with its count and keeps saved icons and far dots', () => {
    const { clusters, dots } = gatherDots(DOTS, 12);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toMatchObject({ count: 4, dimmed: false });
    expect(dots.map((entry) => entry.id).sort()).toEqual(['far', 'saved']);
  });

  it('dims a bubble only when every dot in it is filtered out', () => {
    const allDimmed = DOTS.map((entry) => ({ ...entry, dimmed: true }));
    expect(gatherDots(allDimmed, 12).clusters[0]?.dimmed).toBe(true);
  });

  it('leaves every dot on its own from street zoom', () => {
    const { clusters, dots } = gatherDots(DOTS, STREET_ZOOM);
    expect(clusters).toEqual([]);
    expect(dots).toHaveLength(DOTS.length);
  });

  it('leaves lone dots at least the gather radius apart', () => {
    const grid = Array.from({ length: 60 }, (_, index) =>
      dot(`g${String(index)}`, -8.5 + (index % 8) * 0.004, 115.25 + Math.floor(index / 8) * 0.004),
    );
    const zoom = 12;
    const world = 512 * 2 ** zoom;
    const { dots } = gatherDots(grid, zoom);
    const px = (entry: PlaceDot) => [((entry.lng + 180) / 360) * world, entry.lat * (world / 360)];
    for (const one of dots) {
      for (const other of dots) {
        if (one.id === other.id) continue;
        const [x1 = 0, y1 = 0] = px(one);
        const [x2 = 0, y2 = 0] = px(other);
        // Near the equator Mercator y is close to linear in latitude.
        expect(Math.hypot(x1 - x2, y1 - y2)).toBeGreaterThan(GATHER_PX * 0.95);
      }
    }
  });
});

describe('the plan as routes', () => {
  const days = [
    { dayNo: 1, date: '2026-10-12' },
    { dayNo: 2, date: '2026-10-13' },
    { dayNo: 3, date: '2026-10-14' },
  ];
  const routes = routeDays(
    [
      { id: 'lunch', dayNo: 1, startsAt: '2026-10-12T05:00:00Z', name: 'Lunch', lat: 0, lng: 0 },
      { id: 'temple', dayNo: 1, startsAt: '2026-10-12T01:00:00Z', name: 'Temple', lat: 0, lng: 0 },
      { id: 'later', dayNo: 1, startsAt: null, name: 'Somewhere', lat: 0, lng: 0 },
      { id: 'spa', dayNo: 3, startsAt: '2026-10-14T08:00:00Z', name: 'Spa', lat: 0, lng: 0 },
    ],
    days,
  );

  it('numbers each day by start time, untimed last, and skips days with no stops', () => {
    expect(routes.map((day) => day.dayNo)).toEqual([1, 3]);
    expect(routes[0]?.stops.map((stop) => [stop.n, stop.id])).toEqual([
      [1, 'temple'],
      [2, 'lunch'],
      [3, 'later'],
    ]);
    expect(routes[0]?.color).not.toBe(routes[1]?.color);
  });

  it('carries each stop leg key and the roads its legs follow', () => {
    const paths = new Map([['stay>s-1', [[115.2, -8.5] as const, [115.3, -8.4] as const]]]);
    const [day] = routeDays(
      [{ id: 'poi-1', legKey: 's-1', dayNo: 1, startsAt: null, name: 'A', lat: 0, lng: 0 }],
      days,
      paths,
    );
    expect(day?.stops[0]).toMatchObject({ id: 'poi-1', legKey: 's-1' });
    expect(day?.legPaths).toBe(paths);
  });

  it('leads with the picked stop day, else today, else the first day', () => {
    expect(leadDay(routes, 'spa', '2026-10-12')).toBe(3);
    expect(leadDay(routes, null, '2026-10-14')).toBe(3);
    expect(leadDay(routes, null, '2026-09-01')).toBe(1);
    expect(leadDay([], null, '2026-09-01')).toBeNull();
  });
});

describe('where the map opens', () => {
  const ubud = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
    lat: -8.5 + i * 0.001,
    lng: 115.26 + i * 0.001,
  }));
  const far = { lat: -8.24, lng: 115.37 };

  it('frames where the crew places mostly are and leaves a far one out', () => {
    const frame = openingFrame([...ubud, far], []);
    expect(frame).toHaveLength(ubud.length);
    expect(Math.max(...frame.map((point) => point[1]))).toBeLessThan(-8.49);
  });

  it('frames every place while the crew has fewer than three of its own', () => {
    expect(openingFrame([far], ubud)).toHaveLength(ubud.length);
    expect(openingFrame([], [])).toEqual([]);
  });
});
