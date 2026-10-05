/**
 * Keeps the trips the phone must have offline subscribed whatever screen is open: every trip under
 * way or starting within the trip-day offline window (the same trips the day bundles are saved for,
 * features/trip/bundle/background-prefetch.ts). The day-of, the hub and the pass then work offline
 * even when the app opens straight onto Home. Every other trip is held only by the screens that
 * show it (./use-trip-streams).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { holdTripStreams } from './use-trip-streams';

/** Days ahead of its start a locked-in trip is kept on the phone. */
export const OFFLINE_LEAD_DAYS = 2;
/**
 * Days a trip stays held after its last date: the phone's calendar can run up to a day ahead of
 * the trip's own clock, and the last evening of a trip must not drop offline.
 */
export const END_GRACE_DAYS = 1;
/** The window moves with the date, so it is read again at least this often. */
const RECHECK_MS = 30 * 60 * 1000;

export const OFFLINE_TRIPS_SQL = `SELECT id FROM trips
  WHERE status IN ('confirmed', 'pre_trip', 'in_trip')
    AND start_date IS NOT NULL AND julianday(start_date) - julianday(?) <= ${OFFLINE_LEAD_DAYS}
    AND julianday(coalesce(end_date, start_date)) >= julianday(?) - ${END_GRACE_DAYS}`;

/** The phone's calendar date, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

/** Holds the offline window's trips now and as they change; returns the stop function. */
export function startOfflineTripHolds(
  db: AbstractPowerSyncDatabase,
  today: () => string = () => localToday(),
): () => void {
  const controller = new AbortController();
  const held = new Map<string, () => void>();
  const run = async () => {
    const date = today();
    const rows = await db.getAll<{ id: string }>(OFFLINE_TRIPS_SQL, [date, date]);
    if (controller.signal.aborted) return;
    const wanted = new Set(rows.map((row) => row.id));
    for (const [tripId, release] of held) {
      if (wanted.has(tripId)) continue;
      held.delete(tripId);
      release();
    }
    for (const tripId of wanted) {
      if (!held.has(tripId)) held.set(tripId, holdTripStreams(db, tripId));
    }
  };
  // One pass at a time: two overlapping passes would both hold a new trip, and the second hold
  // would replace the first one's release, so that trip could never be let go.
  let running: Promise<void> | null = null;
  let again = false;
  const check = () => {
    if (running !== null) {
      again = true;
      return;
    }
    running = run()
      .catch(() => undefined)
      .finally(() => {
        running = null;
        if (again && !controller.signal.aborted) {
          again = false;
          check();
        }
      });
  };
  check();
  db.onChange(
    { onChange: check },
    { tables: ['trips'], throttleMs: 200, signal: controller.signal },
  );
  const timer = setInterval(check, RECHECK_MS);
  return () => {
    controller.abort();
    clearInterval(timer);
    for (const release of held.values()) release();
    held.clear();
  };
}
