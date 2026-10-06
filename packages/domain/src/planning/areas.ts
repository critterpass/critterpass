/**
 * A trip's areas (docs/api-contracts-planning.md, commands): the links between destinations, the
 * stops of a trip with several cities, the area a day is spent in, and the rule that puts each day
 * of the trip at one stop. The phone and the server share the rule so both name the same city.
 */
import { z } from 'zod';

/** `day_trip`: there and back the same day from a city; `onward`: on to a trip's next city. */
export const AREA_LINK_KINDS = ['day_trip', 'onward'] as const;
export const areaLinkKindSchema = z.enum(AREA_LINK_KINDS);
export type AreaLinkKind = z.infer<typeof areaLinkKindSchema>;

export const AREA_LINK_MODES = ['train', 'bus', 'car', 'boat', 'flight', 'tour'] as const;
export const areaLinkModeSchema = z.enum(AREA_LINK_MODES);
export type AreaLinkMode = z.infer<typeof areaLinkModeSchema>;

export const DAY_TRIP_LENGTHS = ['half', 'full'] as const;
export const dayTripLengthSchema = z.enum(DAY_TRIP_LENGTHS);
export type DayTripLength = z.infer<typeof dayTripLengthSchema>;

/** The most cities one trip visits. */
export const MAX_TRIP_STOPS = 6;

export interface StopNights {
  readonly nights: number;
}

/**
 * The stop (0-based index) a day of the trip belongs to. Night `n` is spent at the stop whose run
 * of nights holds it, and day `d` belongs to the stop of night `d`, so the day the crew travels
 * belongs to the stop it arrives at; the last day, and any day past the nights, to the last stop.
 * No stops: every day is at the trip's one stop, index 0.
 */
export function stopIndexOfDay(stops: readonly StopNights[], dayNo: number): number {
  if (stops.length === 0) return 0;
  let lastNight = 0;
  for (const [index, stop] of stops.entries()) {
    lastNight += stop.nights;
    if (dayNo <= lastNight) return index;
  }
  return stops.length - 1;
}

/** Each stop's first and last day number over a trip of `dayCount` days. */
export function stopDayRanges(
  stops: readonly StopNights[],
  dayCount: number,
): Array<{ first: number; last: number }> {
  if (stops.length === 0) return [{ first: 1, last: Math.max(1, dayCount) }];
  const ranges: Array<{ first: number; last: number }> = [];
  let first = 1;
  let lastNight = 0;
  for (const [index, stop] of stops.entries()) {
    lastNight += stop.nights;
    const last = index === stops.length - 1 ? Math.max(dayCount, first) : lastNight;
    ranges.push({ first, last });
    first = last + 1;
  }
  return ranges;
}

const planEditBase = z.strictObject({
  trip_id: z.uuid(),
  /** The version the edit was made against: the trip's crew plan, else the organiser's draft. */
  base_version: z.uuid(),
  day_no: z.number().int().min(1).max(60),
});

export const setDayAreaPayloadSchema = planEditBase.extend({ destination_id: z.uuid() });
export type SetDayAreaPayload = z.infer<typeof setDayAreaPayloadSchema>;
export const clearDayAreaPayloadSchema = planEditBase;
export type ClearDayAreaPayload = z.infer<typeof clearDayAreaPayloadSchema>;

/** Where a stop went when its day changed area (as a dates change reports it). */
export const movedStopSchema = z.object({
  stable_id: z.uuid(),
  to: z.enum(['ideas', 'day']),
  day_no: z.number().int().min(1).optional(),
});
export const dayAreaResultSchema = z.object({
  version_id: z.uuid(),
  moved_stops: z.array(movedStopSchema).optional(),
});
export type DayAreaResult = z.infer<typeof dayAreaResultSchema>;

export const tripStopInputSchema = z.strictObject({
  destination_id: z.uuid(),
  nights: z.number().int().min(1).max(60),
});
export const setTripStopsPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  /** Empty, or the trip's own destination alone: a one-stop trip again. */
  stops: z.array(tripStopInputSchema).max(MAX_TRIP_STOPS),
});
export type SetTripStopsPayload = z.infer<typeof setTripStopsPayloadSchema>;
export const setTripStopsResultSchema = z.object({
  trip_id: z.uuid(),
  stops: z.array(
    z.object({ position: z.number().int().min(1), destination_id: z.uuid(), nights: z.number() }),
  ),
});
export type SetTripStopsResult = z.infer<typeof setTripStopsResultSchema>;
