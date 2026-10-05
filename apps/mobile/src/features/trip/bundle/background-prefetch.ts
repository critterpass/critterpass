/**
 * When the phone saves trip days: for every trip under way or starting within two days, whenever
 * the app comes to the foreground, every half hour while it stays open, and the moment a
 * leave-by's window opens, unless auto-download is off (Settings > Offline). The server builds
 * each day's bundle the evening before, so an evening open already saves tomorrow. This build has
 * no OS background task for it; `refreshTripDays` only fetches what changed, so the extra passes
 * cost nothing once a day is saved.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, kinds and log events, never copy. */
import * as Sentry from '@sentry/react-native';
import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OFFLINE_TRIPS_SQL } from '@/data/powersync/offline-trip-holds';

import { useLiveRows } from '../hub/data/live-rows';
import { refreshTripDays } from './bundle-manager';
import type { TripDayServices } from './services';

export const PREFS_KIND = 'trip_day_prefs';
export const AUTO_ID = `${PREFS_KIND}:auto`;
const EVERY_MS = 30 * 60 * 1000;
export const AUTO_SQL = 'SELECT data FROM local_private WHERE id = ?';

export function autoDownloadOn(rows: readonly { data: string }[]): boolean {
  const data = rows[0]?.data;
  if (data === undefined) return true;
  try {
    return (JSON.parse(data) as { auto?: unknown }).auto !== false;
  } catch {
    return true;
  }
}

export function useDayBundlePrefetch(
  services: TripDayServices,
  /** Changes when a leave-by window opens (the alarm sync's minute tick). */
  windowKey: string,
): void {
  const { db } = useLocalFirst();
  const today = new Date().toISOString().slice(0, 10);
  const trips = useLiveRows<{ id: string }>(OFFLINE_TRIPS_SQL, [today, today], ['trips']);
  const auto = autoDownloadOn(
    useLiveRows<{ data: string }>(AUTO_SQL, [AUTO_ID], ['local_private']).rows,
  );
  const ids = useMemo(() => trips.rows.map((row) => row.id).join(','), [trips.rows]);
  const running = useRef(false);
  useEffect(() => {
    if (!auto || ids === '') return undefined;
    const run = () => {
      if (running.current) return;
      running.current = true;
      void (async () => {
        for (const tripId of ids.split(',')) {
          const outcome = await refreshTripDays(db, services, tripId).catch(() => null);
          if (outcome?.kind === 'saved' && outcome.days > 0) {
            Sentry.addBreadcrumb({
              category: 'trip-day',
              level: 'info',
              message: 'day bundle saved',
              data: { days: outcome.days, files: outcome.downloaded },
            });
          }
        }
      })().finally(() => {
        running.current = false;
      });
    };
    run();
    const timer = setInterval(run, EVERY_MS);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, [auto, ids, db, services, windowKey]);
}
