/** One live fix: epoch-ms time, accuracy radius in metres, anti-spoof bits (1 simulated, 2 accessory). */
export interface LocationFix {
  readonly lat: number;
  readonly lng: number;
  readonly acc: number;
  readonly at: number;
  readonly speed?: number;
  /** The OS says the device is not moving (the engine pauses high accuracy). */
  readonly stationary: boolean;
  readonly mock: number;
}

export interface RegionTransition {
  readonly id: string;
  readonly event: 'enter' | 'exit';
  readonly at: number;
}

export type AccuracyTier = 'high' | 'balanced' | 'coarse' | 'paused';

export interface MonitoredRegion {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly radiusM: number;
}

export interface Subscription {
  remove(): void;
}

/** What the location engine drives (src/lib/location); the route layer passes the real module. */
export interface LocationNative {
  /** Starts the trip-day session (iOS: background activity + service session; Android: FGS). */
  startTripSession(tier: AccuracyTier): Promise<boolean>;
  stopTripSession(): Promise<void>;
  setAccuracy(tier: AccuracyTier): void;
  isSessionRunning(): boolean;
  /** Replaces the OS-monitored regions; resolves with how many the OS now holds. */
  monitorRegions(regions: readonly MonitoredRegion[]): Promise<number>;
  clearRegions(): Promise<void>;
  isLowPowerMode(): boolean;
  /** Region transitions that arrived before anything listened (a relaunch). */
  drainRegionEvents(): readonly RegionTransition[];
  addFixListener(listener: (fix: LocationFix) => void): Subscription;
  addRegionListener(listener: (transition: RegionTransition) => void): Subscription;
}
