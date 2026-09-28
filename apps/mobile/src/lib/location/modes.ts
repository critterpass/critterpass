/**
 * Which session the engine runs, from the trip mode (`@cp/domain` `tripLocationMode`), the
 * location permission level and any open share. Help and SOS shares are never gated: they run
 * the session whatever the trip mode. At home with the opt-in, only a foreground watch runs.
 */
import type { LocationLevel, LocationMode, LocationShareReason } from '@cp/domain';

export type SessionKind =
  /** Nothing runs. */
  | 'none'
  /** Only while the app is on screen (explore at home). */
  | 'foreground'
  /** The trip-day session: background pill (iOS) / foreground service (Android). */
  | 'trip_session';

export type ConsumerKind = 'encounter' | 'share' | 'visit' | 'leaveby';

export interface EngineMode {
  readonly session: SessionKind;
  /** OS-monitored regions for the planner's geofences. */
  readonly regions: boolean;
  readonly consumers: ReadonlySet<ConsumerKind>;
}

export interface ModeInput {
  readonly tripMode: LocationMode;
  readonly level: LocationLevel;
  readonly platform: 'ios' | 'android';
  /** Android: background geofences are allowed (server flag, pending the Play declaration). */
  readonly androidBackgroundGeofences: boolean;
  readonly activeShare: LocationShareReason | null;
}

const ALL: ReadonlySet<ConsumerKind> = new Set(['encounter', 'share', 'visit', 'leaveby']);
const NONE: ReadonlySet<ConsumerKind> = new Set();

export function resolveEngineMode(input: ModeInput): EngineMode {
  const emergency = input.activeShare === 'help' || input.activeShare === 'sos';
  if (input.level === 'none') return { session: 'none', regions: false, consumers: NONE };
  if (input.tripMode === 'off') {
    return emergency
      ? { session: 'trip_session', regions: false, consumers: new Set(['share']) }
      : { session: 'none', regions: false, consumers: NONE };
  }
  if (input.tripMode === 'explore_at_home') {
    const consumers = new Set<ConsumerKind>(['encounter', 'visit']);
    if (input.activeShare !== null) consumers.add('share');
    return { session: emergency ? 'trip_session' : 'foreground', regions: false, consumers };
  }
  if (input.tripMode === 'travel_day') {
    return { session: 'trip_session', regions: false, consumers: new Set(['leaveby', 'share']) };
  }
  const regions =
    input.platform === 'ios' || (input.androidBackgroundGeofences && input.level === 'always');
  return { session: 'trip_session', regions, consumers: ALL };
}
