/**
 * Arriving at the destination, as the phone can tell it: a position the location engine already
 * has (nothing here asks for permission) inside the destination's own area, or, for a destination
 * with no area, in its set's country (an ISO code, like the geocoder's). It counts from the trip's
 * first day: under way, or about to be on its start date.
 */
import { toLocalWallTime } from '@cp/domain';
import { useEffect, useState } from 'react';

import { getLocationEngine } from '@/lib/location';

import type { TripRow } from '../data/queries';
import { boxOf, inBox } from './destination-box';

export interface Position {
  readonly lat: number;
  readonly lng: number;
}

type ArrivalTrip = Pick<TripRow, 'destination_geofence' | 'set_country'>;

/** Inside the destination's area. False when the destination has none (see `hasArrived`). */
export function atDestination(trip: ArrivalTrip, position: Position | null): boolean {
  const box = boxOf(trip.destination_geofence);
  return box !== null && position !== null && inBox(box, position.lat, position.lng);
}

export async function hasArrived(
  trip: ArrivalTrip,
  position: Position,
  geocode: (lat: number, lng: number) => Promise<string | null>,
): Promise<boolean> {
  if (boxOf(trip.destination_geofence) !== null) return atDestination(trip, position);
  if (trip.set_country == null) return false;
  const country = await geocode(position.lat, position.lng);
  return country !== null && country === trip.set_country.toUpperCase();
}

/** The trip's first day has come: it is under way, or today (in its zone) is its start or later. */
export function tripHasStarted(trip: TripRow, now: Date, deviceTz: string): boolean {
  if (trip.status === 'in_trip') return true;
  return (
    trip.start_date !== null && toLocalWallTime(now, trip.tz ?? deviceTz).date >= trip.start_date
  );
}

/** A whole egg on a trip that has started: arriving hatches it. */
export function awaitsArrival(trip: TripRow, now: Date, deviceTz: string): boolean {
  return (
    trip.egg_id !== null && trip.egg_hatched_at === null && tripHasStarted(trip, now, deviceTz)
  );
}

export function latestPosition(): Position | null {
  const fixes = getLocationEngine()?.recentFixes() ?? [];
  return fixes[fixes.length - 1] ?? null;
}

/** How often a screen re-reads the engine's latest position. */
const POSITION_POLL_MS = 20_000;

/** The engine's latest position while `watching`, re-read every few seconds; null without one. */
export function useLatestPosition(watching: boolean): Position | null {
  const [position, setPosition] = useState<Position | null>(null);
  useEffect(() => {
    if (!watching) return undefined;
    const read = () => {
      const next = latestPosition();
      setPosition((prev) =>
        prev?.lat === next?.lat && prev?.lng === next?.lng ? prev : next === null ? null : next,
      );
    };
    read();
    const timer = setInterval(read, POSITION_POLL_MS);
    return () => clearInterval(timer);
  }, [watching]);
  return watching ? position : null;
}
