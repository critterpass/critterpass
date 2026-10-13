import type { MoneyTrip } from '../data/context';

/** A trip as Money names it: its destination, and its month when it has dates. */
export function tripLabel(trip: MoneyTrip, fallback: string): string {
  const name = trip.destinationName ?? fallback;
  return trip.startDate === null ? name : `${name} · ${trip.startDate.slice(0, 7)}`;
}
