/**
 * The trip egg's state for the PASS tab and the hatch ceremony (3l-1): waiting for landing,
 * ready to hatch by hand (the trip is under way and it is the start date or later on this phone),
 * or hatched with the ceremony still unseen on this device. Which ceremonies were seen is kept
 * per device, so a second phone still plays it once; the hatch itself is idempotent server-side.
 */
import { toLocalWallTime } from '@cp/domain';
import { useSyncExternalStore } from 'react';
import { createMMKV } from 'react-native-mmkv';

import type { TripRow } from '../data/queries';

export type EggCardKind = 'waiting' | 'ready' | 'unseen';

export interface EggCard {
  readonly kind: EggCardKind;
  readonly tripId: string;
  readonly eggId: string;
  readonly place: string;
  readonly colour: string | null;
  readonly formId: string | null;
  readonly guideSlug: string | null;
  readonly guideName: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** `hatch_egg{trigger:manual}` is allowed: the trip is under way and today (here) ≥ its start. */
export function canHatchByHand(trip: TripRow, now: Date, tz: string = deviceTimeZone()): boolean {
  if (trip.status !== 'in_trip' || trip.start_date === null) return false;
  return toLocalWallTime(now, tz).date >= trip.start_date;
}

export function eggCardFor(
  trips: readonly TripRow[],
  now: Date,
  seen: (eggId: string) => boolean,
  tz?: string,
): EggCard | null {
  for (const trip of trips) {
    if (trip.egg_id === null) continue;
    const base = {
      tripId: trip.id,
      eggId: trip.egg_id,
      place: trip.destination_name ?? '',
      colour: trip.colour,
      formId: trip.egg_form_id,
      guideSlug: trip.guide_slug,
      guideName: trip.guide_name,
      startDate: trip.start_date,
      endDate: trip.end_date,
    };
    if (trip.egg_hatched_at !== null) {
      if (!seen(trip.egg_id)) return { ...base, kind: 'unseen' };
      continue;
    }
    return { ...base, kind: canHatchByHand(trip, now, tz) ? 'ready' : 'waiting' };
  }
  return null;
}

let storage: {
  getBoolean(key: string): boolean | undefined;
  set(k: string, v: boolean): void;
} | null = null;
const listeners = new Set<() => void>();
let version = 0;

function seenStorage() {
  storage ??= createMMKV({ id: 'cp-critters-hatch' });
  return storage;
}

/** This device already played the ceremony for `eggId`. */
export function hatchSeen(eggId: string): boolean {
  return seenStorage().getBoolean(eggId) ?? false;
}

export function markHatchSeen(eggId: string): void {
  seenStorage().set(eggId, true);
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders when a ceremony is marked seen on this device. */
export function useHatchSeenVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/**
 * A heading broken where its two lines come out closest in length ("WELCOME / TO BALI", never
 * "WELCOME TO / BALI"): the break goes at the space nearest the middle. One word stays whole.
 */
export function balancedBreak(text: string): string {
  const spaces = [...text.matchAll(/ /gu)].map((m) => m.index);
  if (spaces.length === 0) return text;
  const middle = text.length / 2;
  const at = spaces.reduce((best, i) =>
    Math.abs(i - middle) < Math.abs(best - middle) ? i : best,
  );
  return `${text.slice(0, at)}\n${text.slice(at + 1)}`;
}
