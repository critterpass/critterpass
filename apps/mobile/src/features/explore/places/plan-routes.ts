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
}

export interface PlanRouteDay {
  readonly dayNo: number;
  readonly date: string | null;
  readonly color: string;
  readonly stops: readonly PlanRouteStop[];
}

export interface RouteItem {
  readonly id: string;
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
      }));
    return stops.length === 0
      ? []
      : [{ dayNo: day.dayNo, date: day.date, color: dayColor(day.dayNo), stops }];
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

/**
 * Where the map opens without a picked place: the crew's own places (the stay, the plan's stops,
 * the saved places) when there are a few, else every place, without the outliers (the middle 70 %
 * on each axis), so a day trip far away doesn't shrink the town the crew spends its days in.
 */
export function openingFrame(
  core: readonly { readonly lat: number; readonly lng: number }[],
  all: readonly { readonly lat: number; readonly lng: number }[],
): [readonly [number, number], readonly [number, number]] | null {
  const points = core.length >= 3 ? core : all;
  if (points.length === 0) return null;
  const cut = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = (share: number) => sorted[Math.floor(share * (sorted.length - 1))] ?? 0;
    return [at(0.15), at(0.85)] as const;
  };
  const [south, north] = cut(points.map((point) => point.lat));
  const [west, east] = cut(points.map((point) => point.lng));
  return [
    [west, south],
    [east, north],
  ];
}
