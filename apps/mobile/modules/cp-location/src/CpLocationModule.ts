import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { LocationFix, RegionTransition } from './types';

type CpLocationEvents = {
  onFix: (fix: LocationFix) => void;
  onRegion: (transition: RegionTransition) => void;
};

/**
 * The native binding (Swift `CpLocationModule` / Kotlin `CpLocationModule`); `null` in Jest or in
 * a binary built before the module existed.
 */
export declare class NativeCpLocationModule extends NativeModule<CpLocationEvents> {
  startTripSession(tier: string): Promise<boolean>;
  stopTripSession(): Promise<void>;
  setAccuracy(tier: string): void;
  isSessionRunning(): boolean;
  /** Parallel arrays: region ids and `[lat, lng, radiusM]` per region. */
  monitorRegions(
    ids: readonly string[],
    coordinates: readonly (readonly number[])[],
  ): Promise<number>;
  clearRegions(): Promise<void>;
  isLowPowerMode(): boolean;
  drainRegionEvents(): RegionTransition[];
}

export const nativeCpLocationModule =
  requireOptionalNativeModule<NativeCpLocationModule>('CpLocation');
