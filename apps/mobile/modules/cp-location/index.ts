/**
 * The trip-day location session for the engine (src/lib/location): start and stop the session,
 * stream fixes at an accuracy tier, keep the planner's regions monitored by the OS. The native
 * module when linked; otherwise a foreground-only expo-location watch.
 */
import { nativeCpLocationModule, type NativeCpLocationModule } from './src/CpLocationModule';
import { expoFallbackLocation } from './src/expo-fallback';
import type { LocationNative } from './src/types';

export type {
  AccuracyTier,
  LocationFix,
  LocationNative,
  MonitoredRegion,
  RegionTransition,
  Subscription,
} from './src/types';

export function fromNativeModule(native: NativeCpLocationModule): LocationNative {
  return {
    startTripSession: (tier) => native.startTripSession(tier),
    stopTripSession: () => native.stopTripSession(),
    setAccuracy: (tier) => native.setAccuracy(tier),
    isSessionRunning: () => native.isSessionRunning(),
    monitorRegions: (regions) =>
      native.monitorRegions(
        regions.map((region) => region.id),
        regions.map((region) => [region.lat, region.lng, region.radiusM]),
      ),
    clearRegions: () => native.clearRegions(),
    isLowPowerMode: () => native.isLowPowerMode(),
    drainRegionEvents: () => native.drainRegionEvents(),
    addFixListener: (listener) => native.addListener('onFix', listener),
    addRegionListener: (listener) => native.addListener('onRegion', listener),
  };
}

let shared: LocationNative | null = null;

/** Whether this binary has the real session (background pill / foreground service, OS regions). */
export function hasNativeSession(): boolean {
  return nativeCpLocationModule !== null;
}

export function getLocationNative(): LocationNative {
  shared ??=
    nativeCpLocationModule !== null
      ? fromNativeModule(nativeCpLocationModule)
      : expoFallbackLocation();
  return shared;
}
