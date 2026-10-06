/**
 * The trip's driver data: the shared messages and the shortlist read through the api (a driver's
 * number is never synced), kept on this phone per trip so the ride-back card works in airplane
 * mode, and the days a driver is set on (synced with the trip).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, table names and storage keys. */
import { useCallback, useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { useLiveRows } from '@/features/bookings/data/live-rows';

import { deviceDriversApi, type DriversApi, type DriversRead } from './api';

let storage: ReturnType<typeof createMMKV> | undefined;
const store = () => (storage ??= createMMKV({ id: 'cp-drivers' }));
const keyOf = (tripId: string) => `drivers:${tripId}`;

export function cachedDrivers(tripId: string): (DriversRead & { readonly savedAt: string }) | null {
  const raw = store().getString(keyOf(tripId));
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as DriversRead & { readonly savedAt: string };
  } catch {
    return null;
  }
}

export type DriversState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: DriversRead; readonly savedAt: string | null }
  | { readonly kind: 'offline'; readonly data: DriversRead | null; readonly savedAt: string | null }
  | { readonly kind: 'error' };

export function useDrivers(tripId: string, api: DriversApi = deviceDriversApi) {
  const [state, setState] = useState<DriversState>(() => {
    const cached = cachedDrivers(tripId);
    return cached === null
      ? { kind: 'loading' }
      : { kind: 'ready', data: cached, savedAt: cached.savedAt };
  });
  const refresh = useCallback(async () => {
    const outcome = await api.read(tripId);
    if (outcome.kind === 'ok') {
      const savedAt = new Date().toISOString();
      store().set(keyOf(tripId), JSON.stringify({ ...outcome.value, savedAt }));
      setState({ kind: 'ready', data: outcome.value, savedAt: null });
    } else if (outcome.kind === 'offline') {
      const cached = cachedDrivers(tripId);
      setState({ kind: 'offline', data: cached, savedAt: cached?.savedAt ?? null });
    } else {
      setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'error' }));
    }
  }, [api, tripId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { state, refresh };
}

export interface AssignmentRow {
  readonly day_date: string;
  readonly provider_id: string;
  readonly window_start: string | null;
  readonly window_end: string | null;
  readonly pickup: string | null;
  readonly agreed: string | null;
  readonly name: string | null;
  readonly vehicle: string | null;
}

const ASSIGNMENTS_SQL = `SELECT a.day_date, a.provider_id, a.window_start, a.window_end, a.pickup,
    a.agreed, p.name, p.vehicle
  FROM provider_assignments a LEFT JOIN providers p ON p.id = a.provider_id
  WHERE a.trip_id = ? ORDER BY a.day_date`;
const ASSIGNMENT_TABLES = ['provider_assignments', 'providers'];

/** The days a driver is set on, from the synced trip. */
export function useAssignments(tripId: string | null) {
  return useLiveRows<AssignmentRow>(
    ASSIGNMENTS_SQL,
    tripId === null ? null : [tripId],
    ASSIGNMENT_TABLES,
  );
}

const DISMISSED_SQL = `SELECT day_date FROM pickup_gap_dismissals WHERE trip_id = ?`;

/** The days I said NOT NOW to. */
export function useDismissedDays(tripId: string | null): ReadonlySet<string> {
  const { rows } = useLiveRows<{ day_date: string }>(
    DISMISSED_SQL,
    tripId === null ? null : [tripId],
    ['pickup_gap_dismissals'],
  );
  return new Set(rows.map((row) => row.day_date));
}
