/**
 * What this phone said at a trip's stops ("I'm here", then "Done"), kept on the phone per trip and
 * stop: visits do not sync back, so the day plan, day-of and the hub read these to follow her.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { useMemo, useState } from 'react';
import { createMMKV, useMMKVListener, useMMKVString } from 'react-native-mmkv';

export interface CheckIn {
  readonly visitId: string;
  readonly arrivedAt: string;
  readonly leftAt: string | null;
}

export type CheckInState = 'ahead' | 'here' | 'done';

export function checkInState(checkIn: CheckIn | null): CheckInState {
  if (checkIn === null) return 'ahead';
  return checkIn.leftAt === null ? 'here' : 'done';
}

/** What the phone keeps, read back; anything else reads as not checked in. */
export function parseCheckIn(raw: string | undefined): CheckIn | null {
  if (raw === undefined) return null;
  try {
    const value = JSON.parse(raw) as Partial<CheckIn>;
    return typeof value.visitId === 'string' && typeof value.arrivedAt === 'string'
      ? { visitId: value.visitId, arrivedAt: value.arrivedAt, leftAt: value.leftAt ?? null }
      : null;
  } catch {
    return null;
  }
}

/**
 * The next thing said: arriving opens a visit, done closes the same one. `leftAt` is never before
 * the arrival (a phone whose clock stepped back still closes the visit).
 */
export function nextCheckIn(checkIn: CheckIn | null, now: Date, newId: () => string): CheckIn {
  if (checkIn === null || checkIn.leftAt !== null) {
    return { visitId: newId(), arrivedAt: now.toISOString(), leftAt: null };
  }
  const left = Math.max(now.getTime(), Date.parse(checkIn.arrivedAt));
  return { ...checkIn, leftAt: new Date(left).toISOString() };
}

let storage: ReturnType<typeof createMMKV> | null = null;
/** The app's default store, like the other small choices this phone keeps. */
const store = () => (storage ??= createMMKV());
const KEY = 'cp.stop.checkIn';

/** One stop's check-in, kept and read back. */
export function useCheckInValue(tripId: string, stableId: string) {
  return useMMKVString(`${KEY}:${tripId}:${stableId}`, store());
}

/** Every check-in this phone holds for the trip, by stable id, kept up as she says more. */
export function useCheckIns(tripId: string | null): ReadonlyMap<string, CheckIn> {
  const prefix = `${KEY}:${tripId ?? ''}:`;
  const [version, setVersion] = useState(0);
  useMMKVListener((key) => {
    if (key.startsWith(prefix)) setVersion((n) => n + 1);
  }, store());
  return useMemo(() => {
    const all = new Map<string, CheckIn>();
    if (tripId === null) return all;
    for (const key of store().getAllKeys()) {
      if (!key.startsWith(prefix)) continue;
      const checkIn = parseCheckIn(store().getString(key));
      if (checkIn !== null) all.set(key.slice(prefix.length), checkIn);
    }
    return all;
    // `version` re-reads the store after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, tripId, version]);
}

/**
 * What she said at the trip's stops, by stable id: the day plan and day-of read a stop she marked
 * done as over, and one she is at as on now.
 */
export function useSaidStops(tripId: string | null): ReadonlyMap<string, 'here' | 'done'> {
  const checkIns = useCheckIns(tripId);
  return useMemo(() => {
    const said = new Map<string, 'here' | 'done'>();
    for (const [id, checkIn] of checkIns) {
      const state = checkInState(checkIn);
      if (state !== 'ahead') said.set(id, state);
    }
    return said;
  }, [checkIns]);
}
