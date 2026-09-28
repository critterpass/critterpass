/**
 * What the location engine needs from outside the lib layer, wired by the route layer: the
 * native session (cp-location), the fix upload (`POST /v1/loc`), and the country of a point.
 * Structurally identical to cp-location's own types, so the module passes straight in.
 */
export interface EngineFix {
  readonly lat: number;
  readonly lng: number;
  readonly acc: number;
  /** Epoch ms. */
  readonly at: number;
  readonly speed?: number;
  readonly stationary: boolean;
  /** Anti-spoof bits (`MOCK_FLAG_*` from `@cp/domain`); the engine adds the implausible bit. */
  readonly mock: number;
}

export interface EngineRegionEvent {
  readonly id: string;
  readonly event: 'enter' | 'exit';
  readonly at: number;
}

export type AccuracyTier = 'high' | 'balanced' | 'coarse' | 'paused';

export interface NativeRegion {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly radiusM: number;
}

export interface Subscription {
  remove(): void;
}

export interface LocationSessionPort {
  startTripSession(tier: AccuracyTier): Promise<boolean>;
  stopTripSession(): Promise<void>;
  setAccuracy(tier: AccuracyTier): void;
  isSessionRunning(): boolean;
  monitorRegions(regions: readonly NativeRegion[]): Promise<number>;
  clearRegions(): Promise<void>;
  isLowPowerMode(): boolean;
  drainRegionEvents(): readonly EngineRegionEvent[];
  addFixListener(listener: (fix: EngineFix) => void): Subscription;
  addRegionListener(listener: (event: EngineRegionEvent) => void): Subscription;
}

export interface FixUpload {
  readonly shareId: string;
  readonly fixes: readonly {
    readonly lat: number;
    readonly lng: number;
    readonly acc: number;
    readonly at: string;
    readonly mock: number;
    readonly activity: 'unknown' | 'stationary' | 'walking' | 'automotive';
  }[];
}

/** `POST /v1/loc`: resolves with the HTTP status (202 accepted, 429 rate limited, 403 closed). */
export type FixUploader = (
  batch: FixUpload,
) => Promise<{ readonly status: number; readonly retryAfterS?: number }>;
