/**
 * "I'm here" and "Done" on a stop of today. Saying it records a visit to the stop's place the way
 * a manual check-in does (`record_visit`, source `manual`: the place and two instants, never where
 * the phone is), queued like any command so it works with no signal. Visits do not sync back to the
 * phone, so what this phone said is kept here, per trip and stop, for the buttons to read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and storage keys, never copy. */
import { generateUuidV7, type RecordVisitPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';
import { createMMKV, useMMKVListener, useMMKVString } from 'react-native-mmkv';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';

export const checkInCommand = defineClientCommand<RecordVisitPayload>({
  name: 'record_visit',
  offline: true,
  summarize: (payload) =>
    payload.left_at === undefined
      ? msg({ id: 'plan.day.stop.queued.here', message: "You're here" })
      : msg({ id: 'plan.day.stop.queued.done', message: 'Done at a stop' }),
});

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

export function useStopCheckIn(tripId: string, stableId: string, poiId: string | null) {
  const [raw, setRaw] = useMMKVString(`${KEY}:${tripId}:${stableId}`, store());
  const { send } = useCommand(checkInCommand);
  const checkIn = parseCheckIn(raw);
  const state = checkInState(checkIn);
  /** "I'm here", then "Done"; nothing once the stop is done. */
  const advance = useCallback(() => {
    const current = parseCheckIn(raw);
    if (current?.leftAt != null) return;
    const next = nextCheckIn(current, new Date(), generateUuidV7);
    setRaw(JSON.stringify(next));
    // A stop with no place has nothing to visit: it is kept on this phone only.
    if (poiId === null) return;
    void send({
      visit_id: next.visitId,
      trip_id: tripId,
      poi_id: poiId,
      source: 'manual',
      arrived_at: next.arrivedAt,
      ...(next.leftAt === null ? {} : { left_at: next.leftAt }),
    });
  }, [raw, setRaw, send, tripId, poiId]);
  return { checkIn, state, advance };
}

/**
 * What this phone said at the trip's stops, by stable id, kept up as she says more: the day plan
 * and the day-of screen read a stop she marked done as over, and one she is at as on now.
 */
export function useSaidStops(tripId: string | null): ReadonlyMap<string, 'here' | 'done'> {
  const prefix = `${KEY}:${tripId ?? ''}:`;
  const [version, setVersion] = useState(0);
  useMMKVListener((key) => {
    if (key.startsWith(prefix)) setVersion((n) => n + 1);
  }, store());
  return useMemo(() => {
    const said = new Map<string, 'here' | 'done'>();
    if (tripId === null) return said;
    for (const key of store().getAllKeys()) {
      if (!key.startsWith(prefix)) continue;
      const state = checkInState(parseCheckIn(store().getString(key)));
      if (state !== 'ahead') said.set(key.slice(prefix.length), state);
    }
    return said;
    // `version` re-reads the store after a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix, tripId, version]);
}
