/**
 * A trip's areas as the screens read them: its stops with their days, the area each day is spent
 * in (its own, else its stop's, by the rule the server shares), whether that makes the day a day
 * trip, the link that says how to get there, and the day trips each stop offers. With the switch
 * off the answer is "one stop, no day trips" whatever rows are on the phone.
 */
import { stopDayRanges, stopIndexOfDay } from '@cp/domain';

import type { AreaLink } from './area-links';
import type { AreaDayRow, StopRow } from './area-queries';

export interface TripStop {
  readonly index: number;
  readonly destinationId: string | null;
  readonly name: string | null;
  readonly firstDay: number;
  readonly lastDay: number;
}

export interface DayArea {
  readonly dayNo: number;
  readonly dayId: string | null;
  readonly date: string | null;
  readonly stopIndex: number;
  /** Where the day is spent: its own area, else its stop's destination. */
  readonly areaId: string | null;
  /** The day is spent away from its stop, there and back. */
  readonly dayTrip: boolean;
  /** The area's name on a day trip (from its link, else its row); null on a day at its stop. */
  readonly areaName: string | null;
  /** How to get there; null on a day at its stop, and on a day trip whose link is gone. */
  readonly link: AreaLink | null;
}

export interface TripAreas {
  /** The switch: off answers one stop and no day trips. */
  readonly on: boolean;
  readonly stops: readonly TripStop[];
  readonly days: readonly DayArea[];
  /** The day trips each stop offers, by the stop's destination: the essential ones first. */
  readonly dayTrips: ReadonlyMap<string, readonly AreaLink[]>;
}

export interface TripAreasInput {
  readonly on: boolean;
  readonly destinationId: string | null;
  readonly destinationName: string | null;
  readonly stops: readonly StopRow[];
  readonly days: readonly AreaDayRow[];
  /** Every link read for the trip's stops, in the api's order. */
  readonly links: readonly AreaLink[];
}

function oneStop(input: TripAreasInput): TripAreas {
  const last = input.days.reduce((max, day) => Math.max(max, day.day_no), 1);
  return {
    on: input.on,
    stops: [
      {
        index: 0,
        destinationId: input.destinationId,
        name: input.destinationName,
        firstDay: 1,
        lastDay: last,
      },
    ],
    days: input.days.map((day) => ({
      dayNo: day.day_no,
      dayId: day.id ?? null,
      date: day.date ?? null,
      stopIndex: 0,
      areaId: input.destinationId,
      dayTrip: false,
      areaName: null,
      link: null,
    })),
    dayTrips: new Map(),
  };
}

export function buildTripAreas(input: TripAreasInput): TripAreas {
  if (!input.on) return oneStop(input);
  const base = oneStop(input);
  const dayCount = base.stops[0]?.lastDay ?? 1;
  const stops: TripStop[] =
    input.stops.length === 0
      ? [...base.stops]
      : stopDayRanges(input.stops, dayCount).map((range, index) => ({
          index,
          destinationId: input.stops[index]?.destination_id ?? null,
          name: input.stops[index]?.name ?? null,
          firstDay: range.first,
          lastDay: range.last,
        }));
  const dayTrips = new Map<string, AreaLink[]>();
  for (const link of input.links) {
    if (link.kind !== 'day_trip') continue;
    dayTrips.set(link.fromId, [...(dayTrips.get(link.fromId) ?? []), link]);
  }
  for (const [from, links] of dayTrips) {
    // A stable sort: the essential ones lead, each group in the api's order.
    dayTrips.set(
      from,
      [...links].sort((a, b) => Number(b.essential) - Number(a.essential)),
    );
  }
  const days = input.days.map((day): DayArea => {
    const stopIndex = stopIndexOfDay(input.stops, day.day_no);
    const stopId = stops[stopIndex]?.destinationId ?? input.destinationId;
    const own = day.destination_id ?? null;
    const dayTrip = own !== null && own !== stopId;
    const link = !dayTrip
      ? null
      : ((stopId === null ? undefined : dayTrips.get(stopId))?.find((l) => l.toId === own) ?? null);
    return {
      dayNo: day.day_no,
      dayId: day.id ?? null,
      date: day.date ?? null,
      stopIndex,
      areaId: own ?? stopId,
      dayTrip,
      areaName: dayTrip ? (link?.toName ?? day.area_name ?? null) : null,
      link,
    };
  });
  return { on: true, stops, days, dayTrips };
}

export function dayAreaOf(areas: TripAreas, dayNo: number): DayArea | null {
  return areas.days.find((day) => day.dayNo === dayNo) ?? null;
}

/** The day a day-trip area is already on, if any. */
export function dayOfArea(areas: TripAreas, areaId: string): DayArea | null {
  return areas.days.find((day) => day.dayTrip && day.areaId === areaId) ?? null;
}

/** The stop the next day with no day trip is in: the one whose day trips Explore offers. */
export function nextFreeStop(areas: TripAreas, fromDayNo = 1): TripStop | null {
  const free =
    areas.days.find((day) => day.dayNo >= fromDayNo && !day.dayTrip) ??
    areas.days.find((day) => !day.dayTrip);
  return areas.stops[free?.stopIndex ?? 0] ?? null;
}
