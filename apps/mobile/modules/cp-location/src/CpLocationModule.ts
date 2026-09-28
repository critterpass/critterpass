import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { LocationFix, MonitoredRegion, RegionTransition } from './types';

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
  monitorRegions(regions: readonly MonitoredRegion[]): Promise<number>;
  clearRegions(): Promise<void>;
  isLowPowerMode(): boolean;
  drainRegionEvents(): RegionTransition[];
}

export const nativeCpLocationModule =
  requireOptionalNativeModule<NativeCpLocationModule>('CpLocation');
