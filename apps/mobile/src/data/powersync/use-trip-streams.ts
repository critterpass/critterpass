/**
 * Holds a trip's parameterised sync streams while mounted: `trip` (the trip's rows: setup, plan,
 * money, the crew-visible versions) and `trip_pack` (the destination's places, weather and
 * crowds). Neither is auto-subscribed, so a screen that reads trip rows needs this above it; the
 * trip route layout mounts it once for every trip route. Subscriptions outlive the screen by a day
 * so moving between trip screens, or leaving and coming back, does not refetch.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';
import { useEffect } from 'react';

import { useLocalFirst } from './local-first-context';

export const TRIP_STREAMS = ['trip', 'trip_pack'] as const;
export const TRIP_STREAM_TTL_S = 60 * 60 * 24;

/** Subscribes to every trip stream for `tripId`; the returned function releases them all. */
export function holdTripStreams(db: AbstractPowerSyncDatabase, tripId: string): () => void {
  let released = false;
  const held: { unsubscribe(): void }[] = [];
  for (const name of TRIP_STREAMS) {
    db.syncStream(name, { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then(
        (subscription) => {
          if (released) subscription.unsubscribe();
          else held.push(subscription);
        },
        () => undefined,
      );
  }
  return () => {
    released = true;
    for (const subscription of held.splice(0)) subscription.unsubscribe();
  };
}

/** Holds the trip streams for `tripId` while mounted; `null` holds nothing. */
export function useTripStreams(tripId: string | null): void {
  const { db } = useLocalFirst();
  useEffect(() => (tripId === null ? undefined : holdTripStreams(db, tripId)), [db, tripId]);
}
