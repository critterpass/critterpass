/**
 * The day trips Explore in a trip offers: those of the stop the next free day is in, the essential
 * ones first, each with its travel line, its length and the day it is already on.
 */
import type { DayTripLength } from '@cp/domain';

import { dayOfArea, nextFreeStop, type TripAreas } from '@/data/areas/trip-areas-model';

import { travelLine } from '@/data/areas/travel-line';

export interface DayTripCard {
  /** The area's destination id. */
  readonly id: string;
  readonly name: string;
  /** "about 3 h 30 by train each way". */
  readonly travel: string;
  readonly length: DayTripLength | null;
  /** The day of the plan it is already on. */
  readonly dayNo: number | null;
}

export interface DayTripsSection {
  /** The stop the day trips leave from, as the title names it. */
  readonly city: string;
  readonly cards: readonly DayTripCard[];
}

/** Null when the stop offers none: the page is then drawn without the section. */
export function dayTripsSection(areas: TripAreas, fromDayNo = 1): DayTripsSection | null {
  if (!areas.on) return null;
  const stop = nextFreeStop(areas, fromDayNo);
  const links = stop?.destinationId == null ? [] : (areas.dayTrips.get(stop.destinationId) ?? []);
  if (stop === null || links.length === 0) return null;
  return {
    city: stop.name ?? '',
    cards: links.map((link) => ({
      id: link.toId,
      name: link.toName,
      travel: travelLine(link),
      length: link.dayLength,
      dayNo: dayOfArea(areas, link.toId)?.dayNo ?? null,
    })),
  };
}
