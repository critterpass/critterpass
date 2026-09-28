import { beforeEach, describe, expect, it } from '@jest/globals';
import { MOCK_FLAG_IMPLAUSIBLE, type GeofenceSourceContext, type TripModeTrip } from '@cp/domain';

import {
  createLocationEngine,
  FIX_RING_MS,
  type EngineInputs,
  type SessionSummary,
} from '../engine';
import type {
  AccuracyTier,
  EngineFix,
  EngineRegionEvent,
  FixUpload,
  LocationSessionPort,
  NativeRegion,
} from '../ports';

const MIN = 60_000;
/** 2026-10-12 10:00 in Bali (UTC+8), a trip day. */
const TRIP_DAY_10AM = Date.parse('2026-10-12T02:00:00Z');
const POI = { lat: -8.5069, lng: 115.2625 };

const trip: TripModeTrip = {
  status: 'in_trip',
  startDate: '2026-10-10',
  endDate: '2026-10-14',
  tz: 'Asia/Makassar',
  destinationCountry: 'ID',
};

const context: GeofenceSourceContext = {
  tripId: 't1',
  planPois: [{ id: 'warung', lat: POI.lat, lng: POI.lng, radiusM: 60 }],
  stay: null,
};

/** The native session (the module boundary): records calls and lets the test push fixes. */
function fakeSession(lowPower = false) {
  const calls: string[] = [];
  const regions: NativeRegion[][] = [];
  let running = false;
  let fixListener: ((fix: EngineFix) => void) | null = null;
  let regionListener: ((event: EngineRegionEvent) => void) | null = null;
  const port: LocationSessionPort = {
    startTripSession(tier: AccuracyTier) {
      running = true;
      calls.push(`start:${tier}`);
      return Promise.resolve(true);
    },
    stopTripSession() {
      running = false;
      calls.push('stop');
      return Promise.resolve();
    },
    setAccuracy: (tier) => void calls.push(`tier:${tier}`),
    isSessionRunning: () => running,
    monitorRegions(list) {
      regions.push([...list]);
      return Promise.resolve(list.length);
    },
    clearRegions: () => Promise.resolve(void calls.push('clear')),
    isLowPowerMode: () => lowPower,
    drainRegionEvents: () => [{ id: 'plan_pois:warung', event: 'enter', at: 1 }],
    addFixListener(listener) {
      fixListener = listener;
      return { remove: () => (fixListener = null) };
    },
    addRegionListener(listener) {
      regionListener = listener;
      return { remove: () => (regionListener = null) };
    },
  };
  return {
    port,
    calls,
    regions,
    fix: (fix: EngineFix) => fixListener?.(fix),
    region: (event: EngineRegionEvent) => regionListener?.(event),
    listening: () => fixListener !== null,
  };
}

let clock = TRIP_DAY_10AM;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function inputs(over: Partial<EngineInputs> = {}): EngineInputs {
  return {
    trip,
    homeCountry: 'VN',
    exploreAtHome: false,
    deviceTz: 'Asia/Makassar',
    level: 'wiu',
    share: null,
    appActive: true,
    geofenceContext: context,
    androidBackgroundGeofences: false,
    ...over,
  };
}

const fixAt = (at: number, over: Partial<EngineFix> = {}): EngineFix => ({
  ...POI,
  acc: 8,
  at,
  stationary: false,
  mock: 0,
  ...over,
});

beforeEach(() => {
  clock = TRIP_DAY_10AM;
});

describe('location engine', () => {
  it('stays off without a trip and at home', async () => {
    const session = fakeSession();
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
    });
    await engine.update(inputs({ trip: null }));
    expect(session.calls).toEqual([]);
    expect(engine.status()).toMatchObject({ running: false, reason: 'no_trip' });
  });

  it('runs on a trip day, then stops once the device turns out to be at home', async () => {
    const session = fakeSession();
    let country = 'ID';
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
      countryOf: () => Promise.resolve(country),
    });
    await engine.update(inputs());
    expect(session.calls[0]).toBe('start:balanced');
    expect(engine.status()).toMatchObject({
      running: true,
      tripMode: 'trip_day',
      session: 'trip_session',
    });
    session.fix(fixAt(clock));
    await flush();
    expect(engine.status().running).toBe(true);

    clock += 31 * MIN;
    country = 'VN';
    session.fix(fixAt(clock));
    await flush();
    await flush();
    expect(engine.status()).toMatchObject({ running: false, reason: 'at_home' });
    expect(session.calls).toContain('stop');
  });

  it('goes high inside a planned place and coarse once the day’s allowance is spent', async () => {
    const session = fakeSession();
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
      highAccuracyCapMs: () => 10 * MIN,
    });
    await engine.update(inputs());
    const tiers: (AccuracyTier | null)[] = [];
    for (let minute = 0; minute <= 15; minute += 1) {
      session.fix(fixAt(clock));
      await flush();
      tiers.push(engine.status().tier);
      clock += MIN;
    }
    expect(tiers[1]).toBe('high');
    expect(tiers.at(-1)).toBe('coarse');
    expect(session.calls).toEqual(expect.arrayContaining(['tier:high', 'tier:coarse']));
    // The planner handed the plan to CLMonitor with the re-plan boundary.
    expect(session.regions[0]?.map((r) => r.id)).toEqual(['plan_pois:warung', 'replan']);
  });

  it('keeps a resting phone on a coarse stream instead of stopping updates', async () => {
    const session = fakeSession();
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
    });
    await engine.update(inputs({ geofenceContext: null }));
    session.fix(fixAt(clock, { stationary: true }));
    expect(engine.status().tier).toBe('paused');
    expect(session.calls).toContain('tier:coarse');
  });

  it('runs for an open SOS share with no trip, and shares only', async () => {
    const session = fakeSession();
    const uploads: FixUpload[] = [];
    const engine = createLocationEngine({
      session: session.port,
      upload: (batch) => {
        uploads.push(batch);
        return Promise.resolve({ status: 202 });
      },
      platform: 'android',
      now: () => clock,
      schedule: () => () => undefined,
    });
    const visits: EngineFix[] = [];
    engine.subscribe('visit', { onFix: (fix) => visits.push(fix) });
    await engine.update(inputs({ trip: null, share: { id: 's1', reason: 'sos' } }));
    expect(engine.status()).toMatchObject({ running: true, sharing: 'sos' });
    session.fix(fixAt(clock, { stationary: true }));
    expect(engine.status().tier).toBe('high');
    clock += 3000;
    await engine.flushShare();
    expect(uploads).toHaveLength(1);
    expect(visits).toEqual([]);
  });

  it('gates consumers by mode: no visits or encounters on a travel day', async () => {
    const session = fakeSession();
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
    });
    const seen: string[] = [];
    engine.subscribe('visit', {
      onFix: () => seen.push('visit'),
      onRegion: () => seen.push('visit-region'),
    });
    engine.subscribe('leaveby', { onFix: () => seen.push('leaveby') });
    const departure = Date.parse('2026-10-10T01:00:00Z');
    clock = departure;
    await engine.update(inputs({ trip: { ...trip, status: 'pre_trip' } }));
    expect(engine.status().tripMode).toBe('travel_day');
    session.fix(fixAt(clock));
    expect(seen).toEqual(['leaveby']);
  });

  it('replays region transitions held before it listened, flags implausible jumps, keeps five minutes', async () => {
    const session = fakeSession();
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
    });
    const regions: EngineRegionEvent[] = [];
    const fixes: EngineFix[] = [];
    engine.subscribe('visit', { onRegion: (e) => regions.push(e), onFix: (f) => fixes.push(f) });
    await engine.update(inputs());
    expect(regions).toEqual([{ id: 'plan_pois:warung', event: 'enter', at: 1 }]);
    session.region({ id: 'plan_pois:warung', event: 'exit', at: clock });
    expect(regions).toHaveLength(2);
    session.fix(fixAt(clock));
    session.fix(fixAt(clock + 1000, { lat: POI.lat + 0.5 }));
    expect(fixes[1]?.mock).toBe(MOCK_FLAG_IMPLAUSIBLE);
    clock += FIX_RING_MS + 2000;
    expect(engine.recentFixes()).toEqual([]);
  });

  it('runs the foreground-only mode at home only while the app is on screen', async () => {
    const session = fakeSession();
    let country: string | null = 'VN';
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
      countryOf: () => Promise.resolve(country),
    });
    await engine.update(inputs({ exploreAtHome: true }));
    session.fix(fixAt(clock));
    await flush();
    await flush();
    expect(engine.status()).toMatchObject({
      tripMode: 'explore_at_home',
      session: 'foreground',
      running: true,
    });
    await engine.update(inputs({ exploreAtHome: true, appActive: false }));
    expect(engine.status().running).toBe(false);
    country = null;
  });

  it('reports the session when it ends, and stops for a missing location permission', async () => {
    const session = fakeSession();
    const summaries: SessionSummary[] = [];
    const engine = createLocationEngine({
      session: session.port,
      upload: okUpload(),
      platform: 'ios',
      now: () => clock,
      onSessionEnded: (summary) => summaries.push(summary),
    });
    await engine.update(inputs());
    session.fix(fixAt(clock));
    clock += 42 * MIN;
    await engine.update(inputs({ level: 'none' }));
    expect(summaries).toEqual([
      expect.objectContaining({ mode: 'trip_day', minutes: 42, updates: 1 }),
    ]);
    expect(session.listening()).toBe(false);
    await engine.dispose();
  });

  it('asks Android for OS geofences only with Always and the rollout switch', async () => {
    const plain = fakeSession();
    const engine = createLocationEngine({
      session: plain.port,
      upload: okUpload(),
      platform: 'android',
      now: () => clock,
    });
    await engine.update(inputs());
    plain.fix(fixAt(clock));
    await flush();
    expect(plain.regions).toEqual([]);
    await engine.update(inputs({ level: 'always', androidBackgroundGeofences: true }));
    expect(plain.regions.at(-1)?.map((r) => r.id)).toEqual(['plan_pois:warung']);
  });
});

function okUpload() {
  return () => Promise.resolve({ status: 202 });
}
