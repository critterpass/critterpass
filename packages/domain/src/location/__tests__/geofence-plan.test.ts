import { describe, expect, it } from 'vitest';

import {
  createGeofenceSourceRegistry,
  geofenceSources,
  IOS_MONITOR_LIMIT,
  planGeofences,
  planPoisSource,
  registerGeofenceSource,
  REPLAN_INTERVAL_MS,
  shouldReplan,
  staySource,
  type GeofenceCandidate,
  type GeofenceSourceContext,
} from '../geofence-plan';

const center = { lat: -8.5069, lng: 115.2625 };
const ctx: GeofenceSourceContext = {
  tripId: 't1',
  planPois: [
    { id: 'far', lat: center.lat + 0.05, lng: center.lng, radiusM: null },
    { id: 'near', lat: center.lat + 0.001, lng: center.lng, radiusM: 60 },
    { id: 'big', lat: center.lat + 0.01, lng: center.lng, radiusM: 400 },
  ],
  stay: { id: 'villa', lat: center.lat - 0.002, lng: center.lng, radiusM: null },
};

describe('geofence sources', () => {
  it('registers plan POIs and the stay on the app-wide registry', () => {
    expect(geofenceSources.names()).toEqual(expect.arrayContaining(['plan_pois', 'stay']));
    expect(staySource({ ...ctx, stay: null })).toEqual([]);
    expect(planPoisSource(ctx).map((c) => c.radiusM)).toEqual([150, 60, 400]);
  });

  it('lets a feature register its own source once and remove it', () => {
    const spawns = (): readonly GeofenceCandidate[] => [{ id: 's1', ...center, radiusM: 50 }];
    const off = registerGeofenceSource('spawns_test', spawns);
    expect(() => registerGeofenceSource('spawns_test', spawns)).toThrow(/already registered/);
    expect(geofenceSources.collect(ctx).get('spawns_test')).toHaveLength(1);
    off();
    off();
    expect(geofenceSources.names()).not.toContain('spawns_test');
  });

  it('rejects names that are not snake_case', () => {
    const registry = createGeofenceSourceRegistry();
    expect(() => registry.register('Spawns', () => [])).toThrow(/invalid geofence source/);
  });

  it('only removes the source it registered', () => {
    const registry = createGeofenceSourceRegistry();
    const off = registry.register('a', () => []);
    off();
    registry.register('a', () => []);
    off();
    expect(registry.names()).toEqual(['a']);
  });
});

describe('planGeofences', () => {
  it('picks the nearest candidates, floors radii at 150 m and dedupes', () => {
    const registry = createGeofenceSourceRegistry();
    registry.register('plan_pois', planPoisSource);
    registry.register('stay', staySource);
    const candidates = new Map(registry.collect(ctx));
    candidates.set('plan_pois', [...(candidates.get('plan_pois') ?? []), ...planPoisSource(ctx)]);
    const plan = planGeofences(center, candidates, 42, { max: 3 });
    expect(plan.plannedAt).toBe(42);
    expect(plan.regions.map((r) => r.id)).toEqual([
      'plan_pois:near',
      'stay:villa',
      'plan_pois:big',
    ]);
    expect(plan.regions.map((r) => r.radiusM)).toEqual([150, 150, 400]);
  });

  it('breaks distance ties by id and honours a custom floor', () => {
    const same = [
      { id: 'b', ...center, radiusM: 10 },
      { id: 'a', ...center, radiusM: 10 },
      { id: 'a', ...center, radiusM: 10 },
    ];
    const plan = planGeofences(
      center,
      new Map([
        ['x', same],
        ['y', [{ id: 'a', ...center, radiusM: 10 }]],
      ]),
      0,
      {
        max: IOS_MONITOR_LIMIT,
        minRadiusM: 100,
      },
    );
    expect(plan.regions.map((r) => `${r.id}/${r.radiusM}`)).toEqual([
      'x:a/100',
      'x:b/100',
      'y:a/100',
    ]);
  });

  it('reserves one slot for the re-plan boundary when asked', () => {
    const candidates = new Map([['plan_pois', planPoisSource(ctx)]]);
    const plan = planGeofences(center, candidates, 0, { max: 2, replanRegion: true });
    expect(plan.regions.map((r) => r.id)).toEqual(['plan_pois:near', 'replan']);
    expect(plan.regions[1]).toMatchObject({ radiusM: 1000, ...center });
    const custom = planGeofences(center, candidates, 0, {
      max: 1,
      replanRegion: true,
      replanDistanceM: 500,
    });
    expect(custom.regions).toEqual([expect.objectContaining({ id: 'replan', radiusM: 500 })]);
    expect(planGeofences(center, candidates, 0, { max: 0, replanRegion: true }).regions).toEqual(
      [],
    );
  });
});

describe('shouldReplan', () => {
  const plan = planGeofences(center, new Map(), 0, { max: 20 });

  it('plans when nothing is planned, after 15 minutes, or after a 1 km move', () => {
    expect(shouldReplan(null, center, 0)).toBe(true);
    expect(shouldReplan(plan, center, REPLAN_INTERVAL_MS - 1)).toBe(false);
    expect(shouldReplan(plan, center, REPLAN_INTERVAL_MS)).toBe(true);
    expect(shouldReplan(plan, { lat: center.lat + 0.01, lng: center.lng }, 1)).toBe(true);
    expect(shouldReplan(plan, { lat: center.lat + 0.005, lng: center.lng }, 1)).toBe(false);
    expect(shouldReplan(plan, center, 10, { intervalMs: 10 })).toBe(true);
    expect(
      shouldReplan(plan, { lat: center.lat + 0.005, lng: center.lng }, 1, { distanceM: 100 }),
    ).toBe(true);
  });
});
