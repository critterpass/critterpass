/**
 * The plan's days as the places map draws them (7c-1): each day's stops numbered in time order in
 * the day's colour, from the stay, with the day the map leads with (the picked stop's day, else
 * today's, else the first day with stops). A stop at a curated place carries the place's id, so a
 * tap on it picks the place.
 */
import { tokens } from '@cp/design-tokens';

const { color } = tokens;

/** The days' colours in order (the planning kit's day chips use the same run). */
export const DAY_COLORS: readonly string[] = [
  color.yellow,
  color.pink,
  color.blue,
  color.orange,
  color.green.base,
  color.paper.base,
];

export function dayColor(dayNo: number): string {
  return DAY_COLORS[(Math.max(1, dayNo) - 1) % DAY_COLORS.length] ?? color.yellow;
}

export interface PlanRouteStop {
  /** The curated place's id, else the item's stable id (a pin). */
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  /** The plan item's stable id: the stop's key in the plan's stored legs. */
  readonly legKey?: string;
}

export interface PlanRouteDay {
  readonly dayNo: number;
  readonly date: string | null;
  readonly color: string;
  readonly stops: readonly PlanRouteStop[];
  /** The road each leg follows, keyed `from>to`; a leg without one draws straight. */
  readonly legPaths?: ReadonlyMap<string, readonly (readonly [number, number])[]>;
}

export interface RouteItem {
  readonly id: string;
  /** The plan item's stable id, when the stop is drawn under another id (its place's). */
  readonly legKey?: string | undefined;
  readonly dayNo: number;
  readonly startsAt: string | null;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

function startOrder(item: RouteItem): number {
  const at = item.startsAt === null ? Number.NaN : Date.parse(item.startsAt);
  return Number.isNaN(at) ? Number.MAX_SAFE_INTEGER : at;
}

/** Each day with stops, its stops numbered by start time (untimed last, then by name). */
export function routeDays(
  items: readonly RouteItem[],
  days: readonly { readonly dayNo: number; readonly date: string | null }[],
  legPaths?: PlanRouteDay['legPaths'],
): PlanRouteDay[] {
  return days.flatMap((day) => {
    const stops = items
      .filter((item) => item.dayNo === day.dayNo)
      .sort((a, b) => startOrder(a) - startOrder(b) || a.name.localeCompare(b.name))
      .map((item, index) => ({
        id: item.id,
        n: index + 1,
        name: item.name,
        lat: item.lat,
        lng: item.lng,
        ...(item.legKey === undefined ? {} : { legKey: item.legKey }),
      }));
    return stops.length === 0
      ? []
      : [
          {
            dayNo: day.dayNo,
            date: day.date,
            color: dayColor(day.dayNo),
            stops,
            ...(legPaths === undefined ? {} : { legPaths }),
          },
        ];
  });
}

/** The day the map leads with: the picked stop's, else today's, else the first with stops. */
export function leadDay(
  days: readonly PlanRouteDay[],
  pickedId: string | null,
  today: string,
): number | null {
  const picked =
    pickedId === null
      ? undefined
      : days.find((day) => day.stops.some((stop) => stop.id === pickedId));
  if (picked !== undefined) return picked.dayNo;
  return (days.find((day) => day.date === today) ?? days[0])?.dayNo ?? null;
}

type LngLatPoint = readonly [number, number];

/** Kilometres between two `[lng, lat]` points (equirectangular: plenty for framing). */
function km(a: LngLatPoint, b: LngLatPoint): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111.32;
}

/** A place this far from where the places mostly are (and over 3× the middle distance) is "far". */
const FAR_KM = 6;

/**
 * Where the map opens without a picked place: the crew's own places (the stay, the plan's stops,
 * the saved places) when there are a few, else every place, without the far ones (a day trip's
 * stop, a temple across the island), as the trip map frames a day. The far ones stay reachable
 * by the edge chips and by zooming out.
 */
export function openingFrame(
  core: readonly { readonly lat: number; readonly lng: number }[],
  all: readonly { readonly lat: number; readonly lng: number }[],
): LngLatPoint[] {
  const points = (core.length >= 3 ? core : all).map((point): LngLatPoint => [
    point.lng,
    point.lat,
  ]);
  if (points.length < 3) return points;
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  const centre: LngLatPoint = [median(points.map((p) => p[0])), median(points.map((p) => p[1]))];
  const distances = points.map((point) => km(point, centre));
  const typical = median(distances);
  const kept = points.filter((_, index) => {
    const d = distances[index] ?? 0;
    return d <= FAR_KM || d <= typical * 3;
  });
  return kept.length >= 2 ? kept : points;
}
