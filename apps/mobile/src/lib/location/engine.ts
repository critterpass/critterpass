/**
 * The location engine: on only in trip mode (or while a Help/SOS share is open), running the
 * trip-day session with the accuracy the battery budget allows, feeding the geofence planner,
 * the share publisher and the consumers (encounters, visits, leave-by). Fixes live in memory for
 * five minutes at most; nothing here writes a position anywhere.
 */
import {
  checkPlausibility,
  MOCK_FLAG_ACCESSORY,
  MOCK_FLAG_SIMULATED,
  tripLocationMode,
  type FixEvidence,
  type GeofenceSourceContext,
  type LocationLevel,
  type LocationMode,
  type TripDayWindow,
  type TripModeReason,
  type TripModeTrip,
} from '@cp/domain';

import { createBudget, type Budget } from './budget';
import { resolveEngineMode, type ConsumerKind, type EngineMode, type SessionKind } from './modes';
import { createPlannerBridge } from './planner-bridge';
import type {
  AccuracyTier,
  EngineFix,
  EngineRegionEvent,
  FixUploader,
  LocationSessionPort,
  Subscription,
} from './ports';
import { createSharePublisher, type ActiveShare } from './share-publisher';
import { createSubscriptions, type Consumer } from './subscriptions';

/** No fix is kept longer than this, in memory only. */
export const FIX_RING_MS = 5 * 60_000;
/** How often the device's country is re-checked (at home vs away). */
const COUNTRY_RECHECK_MS = 30 * 60_000;

export interface EngineInputs {
  readonly trip: TripModeTrip | null;
  readonly homeCountry: string | null;
  readonly exploreAtHome: boolean;
  readonly deviceTz: string;
  readonly level: LocationLevel;
  readonly share: ActiveShare | null;
  /** The app is on screen (the foreground-only mode stops when it is not). */
  readonly appActive: boolean;
  readonly geofenceContext: GeofenceSourceContext | null;
  readonly androidBackgroundGeofences: boolean;
  readonly window?: TripDayWindow;
}

export interface EngineStatus {
  readonly tripMode: LocationMode;
  readonly reason: TripModeReason;
  readonly session: SessionKind;
  readonly running: boolean;
  readonly tier: AccuracyTier | null;
  readonly regions: number;
  readonly lastFixAt: number | null;
  readonly sharing: ActiveShare['reason'] | null;
}

export interface SessionSummary {
  readonly mode: Exclude<LocationMode, 'off'>;
  readonly minutes: number;
  readonly highAccuracyMinutes: number;
  readonly updates: number;
}

export interface EngineOptions {
  readonly session: LocationSessionPort;
  readonly upload: FixUploader;
  readonly platform: 'ios' | 'android';
  readonly now?: () => number;
  /** Country (ISO alpha-2) of a point, from the on-device geocoder. */
  readonly countryOf?: (lat: number, lng: number) => Promise<string | null>;
  readonly highAccuracyCapMs?: () => number | undefined;
  readonly schedule?: (run: () => void, everyMs: number) => () => void;
  readonly onSessionEnded?: (summary: SessionSummary) => void;
}

const INITIAL_STATUS: EngineStatus = {
  tripMode: 'off',
  reason: 'no_trip',
  session: 'none',
  running: false,
  tier: null,
  regions: 0,
  lastFixAt: null,
  sharing: null,
};

function evidenceOf(fix: EngineFix): FixEvidence {
  return {
    lat: fix.lat,
    lng: fix.lng,
    accuracyM: fix.acc,
    at: fix.at,
    simulated: (fix.mock & MOCK_FLAG_SIMULATED) !== 0,
    accessory: (fix.mock & MOCK_FLAG_ACCESSORY) !== 0,
  };
}

export function createLocationEngine(options: EngineOptions) {
  const now = options.now ?? Date.now;
  const schedule =
    options.schedule ??
    ((run: () => void, everyMs: number) => {
      const timer = setInterval(run, everyMs);
      return () => clearInterval(timer);
    });
  const subscriptions = createSubscriptions();
  const publisher = createSharePublisher({ upload: options.upload, now });
  let inputs: EngineInputs | null = null;
  let mode: EngineMode = { session: 'none', regions: false, consumers: new Set() };
  let status = INITIAL_STATUS;
  let tier: AccuracyTier | null = null;
  let ring: EngineFix[] = [];
  let previous: FixEvidence | null = null;
  let currentCountry: string | null = null;
  let countryCheckedAt = 0;
  let sessionStartedAt: number | null = null;
  let sessionMode: SessionSummary['mode'] | null = null;
  let listeners: Subscription[] = [];
  let stopFlushTimer: (() => void) | null = null;
  const statusListeners = new Set<() => void>();
  let budget: Budget = createBudget({
    now,
    deviceTz: () => inputs?.deviceTz ?? 'UTC',
    capMs: () => options.highAccuracyCapMs?.(),
  });
  const planner = createPlannerBridge({
    session: options.session,
    platform: options.platform,
    context: () => inputs?.geofenceContext ?? null,
    now,
  });

  function setStatus(next: Partial<EngineStatus>): void {
    status = { ...status, ...next };
    for (const listener of statusListeners) listener();
  }

  function setTier(next: AccuracyTier): void {
    // A resting phone keeps a coarse stream rather than none, so moving again is noticed.
    const native = next === 'paused' ? 'coarse' : next;
    if (native !== tier) options.session.setAccuracy(native);
    tier = native;
    setStatus({ tier: next });
  }

  function onFix(raw: EngineFix): void {
    const evidence = evidenceOf(raw);
    const fix: EngineFix = { ...raw, mock: raw.mock | checkPlausibility(previous, evidence).flags };
    previous = evidence;
    ring.push(fix);
    ring = ring.filter((f) => now() - f.at <= FIX_RING_MS);
    budget.recordUpdate();
    setStatus({ lastFixAt: fix.at });
    maybeCheckCountry(fix);
    void planner
      .onFix(fix)
      .then(() => setStatus({ regions: planner.currentPlan()?.regions.length ?? 0 }));
    const share = publisher.activeShare();
    setTier(
      budget.decide({
        insideGeofence: planner.isInside(fix),
        activeShare: share !== null,
        emergencyShare: share?.reason === 'help' || share?.reason === 'sos',
        activeEncounter: subscriptions.has('encounter'),
        stationary: fix.stationary,
        lowPower: options.session.isLowPowerMode(),
      }),
    );
    if (mode.consumers.has('share')) publisher.push(fix);
    subscriptions.fix(mode.consumers, fix);
  }

  function onRegion(event: EngineRegionEvent): void {
    planner.onRegion(event);
    subscriptions.region(mode.consumers, event);
  }

  function maybeCheckCountry(fix: EngineFix): void {
    if (options.countryOf === undefined || now() - countryCheckedAt < COUNTRY_RECHECK_MS) return;
    countryCheckedAt = now();
    void options.countryOf(fix.lat, fix.lng).then((country) => {
      if (country === null || country === currentCountry) return;
      currentCountry = country;
      if (inputs !== null) void apply(inputs);
    });
  }

  async function startSession(kind: SessionKind, tripMode: LocationMode): Promise<void> {
    if (listeners.length === 0) {
      listeners = [
        options.session.addFixListener(onFix),
        options.session.addRegionListener(onRegion),
      ];
      for (const event of options.session.drainRegionEvents()) onRegion(event);
    }
    if (!status.running) {
      const first: AccuracyTier = 'balanced';
      await options.session.startTripSession(first);
      tier = first;
      sessionStartedAt = now();
      sessionMode = tripMode === 'off' ? 'trip_day' : tripMode;
      setStatus({ running: true, tier: first, session: kind });
    }
  }

  async function stopSession(): Promise<void> {
    for (const listener of listeners) listener.remove();
    listeners = [];
    if (!status.running) return;
    await options.session.stopTripSession();
    await planner.setRegionsEnabled(false);
    budget.close();
    const snapshot = budget.snapshot();
    if (sessionStartedAt !== null && sessionMode !== null) {
      options.onSessionEnded?.({
        mode: sessionMode,
        minutes: Math.round((now() - sessionStartedAt) / 60_000),
        highAccuracyMinutes: Math.round(snapshot.highAccuracyMs / 60_000),
        updates: snapshot.updates,
      });
    }
    sessionStartedAt = null;
    sessionMode = null;
    tier = null;
    ring = [];
    previous = null;
    planner.reset();
    setStatus({ running: false, tier: null, session: 'none', regions: 0 });
  }

  function syncFlushTimer(): void {
    const active = publisher.activeShare() !== null;
    if (active && stopFlushTimer === null) {
      stopFlushTimer = schedule(() => void publisher.flush(), 1000);
    } else if (!active && stopFlushTimer !== null) {
      stopFlushTimer();
      stopFlushTimer = null;
    }
  }

  async function apply(next: EngineInputs): Promise<void> {
    inputs = next;
    const trip = tripLocationMode({
      trip: next.trip,
      now: new Date(now()),
      homeCountry: next.homeCountry,
      currentCountry,
      exploreAtHome: next.exploreAtHome,
      deviceTz: next.deviceTz,
      ...(next.window ? { window: next.window } : {}),
    });
    mode = resolveEngineMode({
      tripMode: trip.mode,
      level: next.level,
      platform: options.platform,
      androidBackgroundGeofences: next.androidBackgroundGeofences,
      activeShare: next.share?.reason ?? null,
    });
    const session: SessionKind =
      mode.session === 'foreground' && !next.appActive ? 'none' : mode.session;
    setStatus({ tripMode: trip.mode, reason: trip.reason, session });
    publisher.setShare(mode.consumers.has('share') ? next.share : null);
    setStatus({ sharing: publisher.activeShare()?.reason ?? null });
    syncFlushTimer();
    if (session === 'none') {
      await stopSession();
      return;
    }
    await startSession(session, trip.mode);
    await planner.setRegionsEnabled(mode.regions);
  }

  return {
    /** Re-evaluates the mode from fresh inputs and starts, retunes or stops the session. */
    update: (next: EngineInputs): Promise<void> => apply(next),
    subscribe: (kind: ConsumerKind, consumer: Consumer): (() => void) =>
      subscriptions.subscribe(kind, consumer),
    status: (): EngineStatus => status,
    subscribeStatus(listener: () => void): () => void {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    /** Fixes of the last five minutes (dwell samples for encounters), newest last. */
    recentFixes: (): readonly EngineFix[] => ring.filter((f) => now() - f.at <= FIX_RING_MS),
    flushShare: () => publisher.flush(),
    async dispose(): Promise<void> {
      stopFlushTimer?.();
      stopFlushTimer = null;
      await stopSession();
      budget = createBudget({ now, deviceTz: () => inputs?.deviceTz ?? 'UTC' });
    },
  };
}

export type LocationEngine = ReturnType<typeof createLocationEngine>;
