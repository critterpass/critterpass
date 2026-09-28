import { describe, expect, it } from '@jest/globals';

import { fromNativeModule, getLocationNative, hasNativeSession } from '../index';
import type { NativeCpLocationModule } from '../src/CpLocationModule';
import type { LocationFix, MonitoredRegion, RegionTransition } from '../src/types';

/** The native module is the boundary: a recording stand-in with its event emitter. */
function fakeNative() {
  const calls: string[] = [];
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const native = {
    startTripSession: (tier: string) => {
      calls.push(`start:${tier}`);
      return Promise.resolve(true);
    },
    stopTripSession: () => {
      calls.push('stop');
      return Promise.resolve();
    },
    setAccuracy: (tier: string) => void calls.push(`tier:${tier}`),
    isSessionRunning: () => true,
    monitorRegions: (regions: readonly MonitoredRegion[]) => {
      calls.push(`regions:${regions.map((r) => r.id).join(',')}`);
      return Promise.resolve(regions.length);
    },
    clearRegions: () => Promise.resolve(),
    isLowPowerMode: () => true,
    drainRegionEvents: (): RegionTransition[] => [{ id: 'plan_pois:a', event: 'enter', at: 1 }],
    addListener(name: string, listener: (payload: unknown) => void) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return { remove: () => set.delete(listener) };
    },
  } as unknown as NativeCpLocationModule;
  const emit = (name: string, payload: unknown) => {
    for (const listener of listeners.get(name) ?? []) listener(payload);
  };
  return { native, calls, emit };
}

describe('cp-location JS face', () => {
  it('passes session, tier and region calls straight to the native module', async () => {
    const { native, calls } = fakeNative();
    const location = fromNativeModule(native);
    expect(await location.startTripSession('balanced')).toBe(true);
    location.setAccuracy('high');
    expect(await location.monitorRegions([{ id: 'stay:v', lat: 0, lng: 0, radiusM: 150 }])).toBe(1);
    await location.stopTripSession();
    expect(calls).toEqual(['start:balanced', 'tier:high', 'regions:stay:v', 'stop']);
    expect(location.isLowPowerMode()).toBe(true);
    expect(location.drainRegionEvents()).toHaveLength(1);
  });

  it('delivers fix and region events until unsubscribed', () => {
    const { native, emit } = fakeNative();
    const location = fromNativeModule(native);
    const fixes: LocationFix[] = [];
    const sub = location.addFixListener((fix) => fixes.push(fix));
    const fix: LocationFix = { lat: 1, lng: 2, acc: 5, at: 3, stationary: false, mock: 1 };
    emit('onFix', fix);
    sub.remove();
    emit('onFix', fix);
    expect(fixes).toEqual([fix]);
  });

  it('falls back to a foreground watch when the native module is not linked', () => {
    expect(hasNativeSession()).toBe(false);
    const location = getLocationNative();
    expect(location.isSessionRunning()).toBe(false);
    expect(location.drainRegionEvents()).toEqual([]);
  });
});
