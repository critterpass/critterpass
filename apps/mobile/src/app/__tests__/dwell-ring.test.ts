import { describe, expect, it } from '@jest/globals';

import { INITIAL_DWELL_STATE, haversineMeters, replayDwellSeries, stepDwellState } from '../(dev)/spikes/dwell-ring';
import type { DwellConfig, LocationFix } from '../(dev)/spikes/dwell-ring';

const POI = { lat: 10.762622, lon: 106.660172 }; // Ho Chi Minh City, arbitrary test POI
const CONFIG: DwellConfig = { radiusMeters: 50, thresholdSeconds: 120, graceSeconds: 20, drainPerSecond: 1 / 30 };

function fixAt(offsetSeconds: number, point: { lat: number; lon: number }): LocationFix {
  return { ...point, timestampMs: offsetSeconds * 1000 };
}

/** ~0.00045 deg latitude is close to 50 m; used to build points just inside/outside the radius. */
const INSIDE = { lat: POI.lat + 0.0002, lon: POI.lon };
const OUTSIDE = { lat: POI.lat + 0.01, lon: POI.lon }; // well over 150 m away

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters(POI, POI)).toBe(0);
  });

  it('returns a small positive distance for the "inside" test fixture', () => {
    const distance = haversineMeters(POI, INSIDE);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(CONFIG.radiusMeters);
  });

  it('returns a large distance for the "outside" test fixture', () => {
    expect(haversineMeters(POI, OUTSIDE)).toBeGreaterThan(150);
  });
});

describe('stepDwellState', () => {
  it('accumulates dwell time while continuously inside the radius', () => {
    let state = INITIAL_DWELL_STATE;
    state = stepDwellState(state, fixAt(0, INSIDE), null, POI, CONFIG);
    state = stepDwellState(state, fixAt(30, INSIDE), 0, POI, CONFIG);
    state = stepDwellState(state, fixAt(60, INSIDE), 30_000, POI, CONFIG);
    expect(state.dwellSeconds).toBe(60);
    expect(state.progress).toBeCloseTo(60 / 120, 5);
  });

  it('caps progress at 1 once the threshold is reached', () => {
    let state = INITIAL_DWELL_STATE;
    state = stepDwellState(state, fixAt(0, INSIDE), null, POI, CONFIG);
    state = stepDwellState(state, fixAt(200, INSIDE), 0, POI, CONFIG);
    expect(state.dwellSeconds).toBe(CONFIG.thresholdSeconds);
    expect(state.progress).toBe(1);
  });

  it('does not drain during a brief step outside within the grace window', () => {
    let state = INITIAL_DWELL_STATE;
    state = stepDwellState(state, fixAt(0, INSIDE), null, POI, CONFIG);
    state = stepDwellState(state, fixAt(30, INSIDE), 0, POI, CONFIG); // dwellSeconds = 30
    const beforeStep = state;
    state = stepDwellState(state, fixAt(40, OUTSIDE), 30_000, POI, CONFIG); // 10 s outside, within 20 s grace
    expect(state).toEqual(beforeStep);
  });

  it('drains slowly (not instantly) once outside past the grace window', () => {
    let state = INITIAL_DWELL_STATE;
    state = stepDwellState(state, fixAt(0, INSIDE), null, POI, CONFIG);
    state = stepDwellState(state, fixAt(60, INSIDE), 0, POI, CONFIG); // dwellSeconds = 60
    // 50 s elapsed since the last fix, past the 20 s grace window, draining the whole interval at
    // 1/30 per second ⇒ 60 - 50/30 ≈ 58.33.
    state = stepDwellState(state, fixAt(110, OUTSIDE), 60_000, POI, CONFIG);
    expect(state.dwellSeconds).toBeCloseTo(58.333, 2);
    expect(state.dwellSeconds).toBeLessThan(60);
    expect(state.dwellSeconds).toBeGreaterThan(0);
  });

  it('re-enters and keeps accumulating from where the ring left off', () => {
    let state = INITIAL_DWELL_STATE;
    state = stepDwellState(state, fixAt(0, INSIDE), null, POI, CONFIG);
    state = stepDwellState(state, fixAt(30, INSIDE), 0, POI, CONFIG); // 30 s dwell
    state = stepDwellState(state, fixAt(35, OUTSIDE), 30_000, POI, CONFIG); // within grace: unchanged
    state = stepDwellState(state, fixAt(40, INSIDE), 35_000, POI, CONFIG); // back inside: +5 s (35→40)
    state = stepDwellState(state, fixAt(50, INSIDE), 40_000, POI, CONFIG); // +10 s (40→50)
    expect(state.dwellSeconds).toBe(45);
  });
});

describe('replayDwellSeries', () => {
  it('proves the ring advances over a simulated approach → dwell → depart route', () => {
    const APPROACH = { lat: POI.lat + 0.002, lon: POI.lon };
    const fixes: LocationFix[] = [
      fixAt(0, APPROACH),
      fixAt(30, APPROACH),
      fixAt(60, INSIDE),
      fixAt(90, INSIDE),
      fixAt(120, INSIDE),
      fixAt(150, INSIDE),
      fixAt(180, OUTSIDE),
    ];
    const series = replayDwellSeries(fixes, POI, CONFIG);
    expect(series[1]?.progress).toBe(0); // still approaching, never inside yet
    expect(series[4]?.progress).toBeGreaterThan(series[2]?.progress ?? 0); // rising while dwelling
    expect(series[4]?.progress).toBeCloseTo(90 / 120, 5); // 90 s inside (fixes at 60,90,120,150)
  });
});
