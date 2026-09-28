/**
 * The session for a binary built before the native module existed: a foreground-only position
 * watch through expo-location (no background session, no OS regions). Enough to drive the engine
 * and its tests on an older build; the real session needs the native module.
 */
import * as Location from 'expo-location';

import type {
  AccuracyTier,
  LocationFix,
  LocationNative,
  RegionTransition,
  Subscription,
} from './types';

const ACCURACY: Readonly<Record<Exclude<AccuracyTier, 'paused'>, Location.Accuracy>> = {
  high: Location.Accuracy.High,
  balanced: Location.Accuracy.Balanced,
  coarse: Location.Accuracy.Low,
};

export function expoFallbackLocation(): LocationNative {
  const fixListeners = new Set<(fix: LocationFix) => void>();
  let watch: Location.LocationSubscription | null = null;
  let running = false;

  async function watchAt(tier: AccuracyTier): Promise<void> {
    watch?.remove();
    watch = null;
    if (!running || tier === 'paused') return;
    watch = await Location.watchPositionAsync(
      { accuracy: ACCURACY[tier], distanceInterval: tier === 'high' ? 5 : 25 },
      (position) => {
        const fix: LocationFix = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          acc: position.coords.accuracy ?? 1000,
          at: position.timestamp,
          ...(position.coords.speed !== null && position.coords.speed >= 0
            ? { speed: position.coords.speed }
            : {}),
          stationary: false,
          mock: position.mocked === true ? 1 : 0,
        };
        for (const listener of fixListeners) listener(fix);
      },
    );
  }

  const none: Subscription = { remove: () => undefined };
  return {
    async startTripSession(tier) {
      running = true;
      await watchAt(tier);
      return true;
    },
    stopTripSession() {
      running = false;
      watch?.remove();
      watch = null;
      return Promise.resolve();
    },
    setAccuracy(tier) {
      void watchAt(tier);
    },
    isSessionRunning: () => running,
    monitorRegions: () => Promise.resolve(0),
    clearRegions: () => Promise.resolve(),
    isLowPowerMode: () => false,
    drainRegionEvents: (): readonly RegionTransition[] => [],
    addFixListener(listener) {
      fixListeners.add(listener);
      return { remove: () => fixListeners.delete(listener) };
    },
    addRegionListener: () => none,
  };
}
