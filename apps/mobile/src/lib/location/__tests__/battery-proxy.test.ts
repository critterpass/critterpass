/**
 * The battery proxy recorded in docs/runbooks/location-policy-evidence.md: one scripted trip-day
 * hour through the real engine (budget, planner, tiers), with fixes arriving at the cadence each
 * tier asks the OS for (high 5 s, balanced 20 s, coarse 60 s — the Android fused requests; iOS
 * live updates are system-paced and no faster). It counts location updates and high-accuracy
 * minutes per hour: the numbers the on-device %/h measurement is compared against.
 */
import { describe, expect, it } from '@jest/globals';
import type { GeofenceSourceContext } from '@cp/domain';

import { createLocationEngine } from '../engine';
import type { AccuracyTier, EngineFix, LocationSessionPort } from '../ports';

const MIN = 60_000;
const CADENCE_MS: Readonly<Record<AccuracyTier, number>> = {
  high: 5_000,
  balanced: 20_000,
  coarse: 60_000,
  paused: 60_000,
};

const POIS = [
  { id: 'saraswati', lat: -8.5064, lng: 115.261, radiusM: 80 },
  { id: 'warung', lat: -8.5105, lng: 115.2655, radiusM: 60 },
  { id: 'market', lat: -8.5075, lng: 115.263, radiusM: 100 },
];

/** Where the walker is at minute `m`: walk 20 min, dwell 20 min at the temple, walk 20 min. */
function positionAt(minute: number): { lat: number; lng: number; stationary: boolean } {
  const walkA = { lat: -8.512, lng: 115.268 };
  const temple = POIS[0]!;
  const walkB = { lat: -8.5, lng: 115.255 };
  if (minute < 20) {
    const f = minute / 20;
    return {
      lat: walkA.lat + (temple.lat - walkA.lat) * f,
      lng: walkA.lng + (temple.lng - walkA.lng) * f,
      stationary: false,
    };
  }
  if (minute < 40) return { lat: temple.lat, lng: temple.lng, stationary: minute > 22 };
  const f = (minute - 40) / 20;
  return {
    lat: temple.lat + (walkB.lat - temple.lat) * f,
    lng: temple.lng + (walkB.lng - temple.lng) * f,
    stationary: false,
  };
}

async function simulateTripDayHour(options: {
  readonly encounter: boolean;
  readonly capMs?: number;
}) {
  let tier: AccuracyTier = 'balanced';
  const hook: { listener: ((fix: EngineFix) => void) | null } = { listener: null };
  const session: LocationSessionPort = {
    startTripSession: (t) => {
      tier = t;
      return Promise.resolve(true);
    },
    stopTripSession: () => Promise.resolve(),
    setAccuracy: (t) => void (tier = t),
    isSessionRunning: () => true,
    monitorRegions: (regions) => Promise.resolve(regions.length),
    clearRegions: () => Promise.resolve(),
    isLowPowerMode: () => false,
    drainRegionEvents: () => [],
    addFixListener: (l) => {
      hook.listener = l;
      return { remove: () => (hook.listener = null) };
    },
    addRegionListener: () => ({ remove: () => undefined }),
  };
  const start = Date.parse('2026-10-12T02:00:00Z');
  let clock = start;
  const engine = createLocationEngine({
    session,
    upload: () => Promise.resolve({ status: 202 }),
    platform: 'android',
    now: () => clock,
    ...(options.capMs !== undefined ? { highAccuracyCapMs: () => options.capMs } : {}),
  });
  const context: GeofenceSourceContext = { tripId: 't', planPois: POIS, stay: null };
  if (options.encounter) engine.subscribe('encounter', {});
  await engine.update({
    trip: {
      status: 'in_trip',
      startDate: '2026-10-10',
      endDate: '2026-10-14',
      tz: 'Asia/Makassar',
      destinationCountry: 'ID',
    },
    homeCountry: 'VN',
    exploreAtHome: false,
    deviceTz: 'Asia/Makassar',
    level: 'wiu',
    share: null,
    appActive: true,
    geofenceContext: context,
    androidBackgroundGeofences: false,
  });
  let updates = 0;
  let highMs = 0;
  while (clock < start + 60 * MIN) {
    const p = positionAt((clock - start) / MIN);
    hook.listener?.({
      lat: p.lat,
      lng: p.lng,
      acc: 8,
      at: clock,
      stationary: p.stationary,
      mock: 0,
    });
    await Promise.resolve();
    updates += 1;
    const step = CADENCE_MS[tier];
    if (engine.status().tier === 'high') highMs += step;
    clock += step;
  }
  await engine.dispose();
  return { updatesPerHour: updates, highAccuracyMinutesPerHour: Math.round(highMs / MIN) };
}

describe('battery proxy (one trip-day hour)', () => {
  it('keeps high accuracy to the time near planned places, and inside the daily cap', async () => {
    const walking = await simulateTripDayHour({ encounter: false });
    expect(walking.highAccuracyMinutesPerHour).toBeLessThanOrEqual(25);
    expect(walking.updatesPerHour).toBeLessThan(400);
    const capped = await simulateTripDayHour({ encounter: true, capMs: 10 * MIN });
    expect(capped.highAccuracyMinutesPerHour).toBeLessThanOrEqual(11);
  });
});
