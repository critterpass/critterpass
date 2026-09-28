import { describe, expect, it } from 'vitest';

import {
  chooseAccuracy,
  DEFAULT_HIGH_ACCURACY_CAP_MS,
  highAccuracyUsedMs,
  initialBudget,
  recordTier,
  recordUpdate,
  rollBudget,
  type AccuracyNeeds,
} from '../battery-budget';

const MIN = 60_000;
const none: AccuracyNeeds = {
  insideGeofence: false,
  activeShare: false,
  emergencyShare: false,
  activeEncounter: false,
  stationary: false,
  lowPower: false,
};

describe('battery budget', () => {
  it('accounts high-accuracy stretches, including the one in progress', () => {
    let state = initialBudget('2026-10-12');
    state = recordTier(state, 'high', 0);
    expect(recordTier(state, 'high', 5 * MIN)).toBe(state);
    expect(highAccuracyUsedMs(state, 10 * MIN)).toBe(10 * MIN);
    state = recordTier(state, 'balanced', 10 * MIN);
    expect(state).toMatchObject({ highMs: 10 * MIN, highSince: null });
    expect(recordTier(state, 'coarse', 20 * MIN)).toBe(state);
    expect(highAccuracyUsedMs(state, 99 * MIN)).toBe(10 * MIN);
    expect(recordUpdate(recordUpdate(state)).updates).toBe(2);
  });

  it('rolls over at the local day boundary, restarting an open stretch', () => {
    const open = recordTier({ ...initialBudget('2026-10-12'), highMs: 80 * MIN }, 'high', 0);
    expect(rollBudget(open, '2026-10-12', 1)).toBe(open);
    expect(rollBudget(open, '2026-10-13', 7)).toEqual({
      day: '2026-10-13',
      highMs: 0,
      highSince: 7,
      updates: 0,
    });
    const closed = initialBudget('2026-10-12');
    expect(rollBudget(closed, '2026-10-13', 7).highSince).toBeNull();
  });

  it('goes high only inside a geofence or during a share or encounter, within the cap', () => {
    const fresh = initialBudget('2026-10-12');
    expect(chooseAccuracy(none, fresh, 0)).toBe('balanced');
    expect(chooseAccuracy({ ...none, insideGeofence: true }, fresh, 0)).toBe('high');
    expect(chooseAccuracy({ ...none, activeEncounter: true }, fresh, 0)).toBe('high');
    const spent = { ...fresh, highMs: DEFAULT_HIGH_ACCURACY_CAP_MS };
    expect(chooseAccuracy({ ...none, insideGeofence: true }, spent, 0)).toBe('coarse');
    expect(
      chooseAccuracy({ ...none, insideGeofence: true }, spent, 0, 2 * DEFAULT_HIGH_ACCURACY_CAP_MS),
    ).toBe('high');
  });

  it('pauses when stationary unless a share runs, and goes coarse in Low Power Mode', () => {
    const fresh = initialBudget('2026-10-12');
    expect(chooseAccuracy({ ...none, stationary: true }, fresh, 0)).toBe('paused');
    expect(chooseAccuracy({ ...none, stationary: true, activeShare: true }, fresh, 0)).toBe('high');
    expect(chooseAccuracy({ ...none, lowPower: true, insideGeofence: true }, fresh, 0)).toBe(
      'coarse',
    );
  });

  it('never throttles a Help or SOS share', () => {
    const spent = { ...initialBudget('2026-10-12'), highMs: 10 * DEFAULT_HIGH_ACCURACY_CAP_MS };
    const sos = {
      ...none,
      emergencyShare: true,
      activeShare: true,
      lowPower: true,
      stationary: true,
    };
    expect(chooseAccuracy(sos, spent, 0)).toBe('high');
  });
});
