/**
 * The pure part of a device calendar sync: the dates it covers (today to the six-month horizon,
 * in the member's zone) and the `set_availability` payload it sends: only a date, a state and the
 * source per day. `maybe` exists only when the member shares tentative events.
 */
import { AVAILABILITY_HORIZON_DAYS, localDateOf, type SetAvailabilityPayload } from '@cp/domain';

import type { DeviceDayState } from './device-calendar';

/** Re-read on foreground once the last sync is older than this. */
export const RESYNC_AFTER_MS = 6 * 60 * 60 * 1000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function syncRange(now: Date, tz: string) {
  const from = localDateOf(now, tz);
  return { from, to: addDays(from, AVAILABILITY_HORIZON_DAYS), tz };
}

export function devicePayload(
  tripId: string,
  days: readonly { readonly date: string; readonly state: DeviceDayState }[],
  tentative: boolean,
): SetAvailabilityPayload {
  return {
    trip_id: tripId,
    days: days
      .filter((day) => tentative || day.state !== 'maybe')
      .map((day) => ({ date: day.date, state: day.state, source: 'device_cal' as const })),
    consent_tentative: tentative,
  };
}

export function isStale(lastSyncedAt: Date | null, now: number): boolean {
  return lastSyncedAt === null || now - lastSyncedAt.getTime() > RESYNC_AFTER_MS;
}
