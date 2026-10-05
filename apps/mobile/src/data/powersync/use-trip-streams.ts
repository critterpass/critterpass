/**
 * Holds a trip's parameterised sync streams while mounted: `trip` (the trip's rows: setup, plan,
 * money, the crew-visible versions), `trip_pack` (the destination's places, weather and crowds),
 * `trip_me` (my own "just me" plan ops) and `trip_draft` (the organiser's pre-proposal draft; it
 * returns no rows to anyone else). Neither is auto-subscribed, so a screen that reads trip rows
 * needs this above it; the trip route layout mounts it once for every trip route.
 *
 * The phone holds only the trips it needs. Every held trip costs the sync connection about 90 of
 * PowerSync's 1,000 parameter results, and past that limit nothing syncs at all. So a trip stays
 * subscribed while a screen holds it, and after its last screen lets go it is kept for one more
 * trip ({@link KEPT_TRIPS}): leaving a trip and coming back does not refetch, but opening a third
 * trip lets the oldest one go, and its subscriptions lapse after {@link TRIP_STREAM_TTL_S}. Rows
 * already on the phone stay readable offline until the next sync removes them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect } from 'react';

import { useLocalFirst } from './local-first-context';

export const TRIP_STREAMS = ['trip', 'trip_pack', 'trip_me', 'trip_draft'] as const;
/** How long a trip nothing holds stays subscribed: long enough to bridge a screen change. */
export const TRIP_STREAM_TTL_S = 60;
/** Trips kept subscribed after their last screen let go, most recent first. */
export const KEPT_TRIPS = 1;

interface Subscription {
  unsubscribe(): void;
}

interface HeldTrip {
  holders: number;
  dropped: boolean;
  readonly subscriptions: Subscription[];
}

interface TripHolds {
  readonly trips: Map<string, HeldTrip>;
  /** Trips no screen holds any more, oldest first. */
  readonly kept: string[];
}

const holdsByDatabase = new WeakMap<AbstractPowerSyncDatabase, TripHolds>();

function holdsFor(db: AbstractPowerSyncDatabase): TripHolds {
  let holds = holdsByDatabase.get(db);
  if (holds === undefined) {
    holds = { trips: new Map(), kept: [] };
    holdsByDatabase.set(db, holds);
  }
  return holds;
}

function subscribe(db: AbstractPowerSyncDatabase, tripId: string): HeldTrip {
  const held: HeldTrip = { holders: 0, dropped: false, subscriptions: [] };
  for (const name of TRIP_STREAMS) {
    db.syncStream(name, { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then(
        (subscription) => {
          if (held.dropped) subscription.unsubscribe();
          else held.subscriptions.push(subscription);
        },
        () => undefined,
      );
  }
  return held;
}

function drop(holds: TripHolds, tripId: string): void {
  const held = holds.trips.get(tripId);
  if (held === undefined) return;
  holds.trips.delete(tripId);
  held.dropped = true;
  for (const subscription of held.subscriptions.splice(0)) subscription.unsubscribe();
}

function trim(holds: TripHolds): void {
  while (holds.kept.length > KEPT_TRIPS) {
    const oldest = holds.kept.shift();
    if (oldest !== undefined) drop(holds, oldest);
  }
}

/**
 * Subscribes to every trip stream for `tripId` (once, however many screens hold it); the returned
 * function lets go of this hold.
 */
export function holdTripStreams(db: AbstractPowerSyncDatabase, tripId: string): () => void {
  const holds = holdsFor(db);
  let held = holds.trips.get(tripId);
  if (held === undefined) {
    held = subscribe(db, tripId);
    holds.trips.set(tripId, held);
  }
  held.holders += 1;
  const kept = holds.kept.indexOf(tripId);
  if (kept !== -1) holds.kept.splice(kept, 1);
  let released = false;
  const current = held;
  return () => {
    if (released) return;
    released = true;
    current.holders -= 1;
    if (current.holders > 0) return;
    holds.kept.push(tripId);
    // After the render that let go has committed: a screen that swaps one trip for another lets go
    // of the old trip before it holds the new one, and that must not evict the trip it goes back to.
    queueMicrotask(() => trim(holds));
  };
}

/** Holds the trip streams for `tripId` while mounted; `null` holds nothing. */
export function useTripStreams(tripId: string | null): void {
  const { db } = useLocalFirst();
  useEffect(() => (tripId === null ? undefined : holdTripStreams(db, tripId)), [db, tripId]);
}
