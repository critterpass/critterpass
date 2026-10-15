/**
 * How itinerary pages lay out a first visit to the destination (`destination_itineraries`, loaded
 * from the researchers' files): the outline's reference for what a good day here holds. Nothing
 * for a destination nobody researched.
 */
import type { FirstVisit } from '@cp/ai';
import { destinationItinerary, withSystem } from '@cp/db';
import type pg from 'pg';

export async function loadFirstVisit(
  pool: pg.Pool,
  destinationId: string,
): Promise<FirstVisit | undefined> {
  const itinerary = await withSystem(pool, (tx) => destinationItinerary(tx, destinationId));
  if (itinerary === null || itinerary.days.length === 0) return undefined;
  return {
    days: itinerary.days.map((day) => ({
      theme: day.theme.en,
      areas: day.areas,
      stops: day.stops.map((stop) => ({ name: stop.name, poiId: stop.poiId })),
      pages: day.sourceCount,
    })),
  };
}
