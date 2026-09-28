/**
 * The app-wide engine the route layer configures, and the status hook the trip hub's chip reads
 * ("On for your trip day", "Off at home", "Sharing with your crew").
 */
import { useSyncExternalStore } from 'react';

import type { EngineStatus, LocationEngine } from './engine';

let engine: LocationEngine | null = null;
const OFF: EngineStatus = {
  tripMode: 'off',
  reason: 'no_trip',
  session: 'none',
  running: false,
  tier: null,
  regions: 0,
  lastFixAt: null,
  sharing: null,
};

export function setLocationEngine(next: LocationEngine | null): void {
  engine = next;
}

export function getLocationEngine(): LocationEngine | null {
  return engine;
}

export function useLocationStatus(): EngineStatus {
  return useSyncExternalStore(
    (listener) => engine?.subscribeStatus(listener) ?? (() => undefined),
    () => engine?.status() ?? OFF,
  );
}
