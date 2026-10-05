/**
 * The places list as one flat run of items for a virtualised list: each group's title and rows,
 * the one IN THE PLAN row, and at most one labelled sponsored row among Tokek's suggestions (third,
 * when the sponsored place is one of them). Under the IN THE PLAN filter the plan is its stops, day
 * by day in time order, instead of the one row.
 */
/* eslint-disable lingui/no-unlocalized-strings -- list keys, never copy. */
import type { PlaceGroups } from './place-groups';
import type { PlanRouteDay } from './plan-routes';
import type { HubPlace } from './places-model';

/** One day of the plan as the list shows it: its stops in time order. */
export interface PlanDayGroup {
  readonly dayNo: number;
  readonly date: string | null;
  readonly places: readonly HubPlace[];
}

/**
 * The plan's stops by day, in the order the day runs. A stop at a place the phone knows is that
 * place; any other stop (a pin, a typed must-do) is listed by its name alone. Without routes (no
 * stop has a spot yet) the planned places are grouped by the day they are on.
 */
export function planDays(
  routes: readonly PlanRouteDay[],
  planned: readonly HubPlace[],
): PlanDayGroup[] {
  const byId = new Map(planned.map((place) => [place.id, place]));
  const days = routes.map((day): PlanDayGroup => ({
    dayNo: day.dayNo,
    date: day.date,
    places: day.stops.map(
      (stop): HubPlace =>
        byId.get(stop.id) ?? {
          id: stop.id,
          poiId: null,
          ideaId: null,
          name: stop.name,
          category: 'other',
          lat: stop.lat,
          lng: stop.lng,
          standing: 'plan',
          backerIds: [],
          dayNo: day.dayNo,
          mustSee: false,
          hours: null,
          bestTime: null,
        },
    ),
  }));
  if (days.length > 0) return days;
  const numbers = [...new Set(planned.map((place) => place.dayNo ?? 0))].sort((a, b) => a - b);
  return numbers.map((dayNo) => ({
    dayNo,
    date: null,
    places: planned.filter((place) => (place.dayNo ?? 0) === dayNo),
  }));
}

export type ListItem =
  | { readonly kind: 'title'; readonly key: string; readonly group: 'saved' | 'plan' | 'suggests' }
  | {
      readonly kind: 'place';
      readonly key: string;
      /** The row's group and place in it, for its test id (`places-suggests-0`). */
      readonly testID: string;
      readonly place: HubPlace;
      readonly sponsored: boolean;
    }
  | { readonly kind: 'plan'; readonly key: string }
  | {
      readonly kind: 'day';
      readonly key: string;
      readonly dayNo: number;
      readonly date: string | null;
      readonly count: number;
    };

/** Where the sponsored row joins Tokek's suggestions. */
export const SPONSORED_AT = 2;

export function listItems(
  groups: PlaceGroups,
  sponsoredPoiId: string | null,
  /** The plan day by day (the IN THE PLAN filter); absent keeps the one summary row. */
  byDay?: readonly PlanDayGroup[],
): ListItem[] {
  const items: ListItem[] = [];
  if (byDay !== undefined) {
    for (const day of byDay) {
      if (day.places.length === 0) continue;
      items.push({
        kind: 'day',
        key: `day:${String(day.dayNo)}`,
        dayNo: day.dayNo,
        date: day.date,
        count: day.places.length,
      });
      day.places.forEach((place, index) =>
        items.push({
          kind: 'place',
          key: `day:${String(day.dayNo)}:${String(index)}:${place.id}`,
          testID: `places-plan-day-${String(day.dayNo)}-${String(index)}`,
          place,
          sponsored: false,
        }),
      );
    }
    return items;
  }
  const rows = (places: readonly HubPlace[], group: 'saved' | 'suggests') =>
    places.map((place, index): ListItem => ({
      kind: 'place',
      key: `${group}:${place.id}`,
      testID: `places-${group}-${String(index)}`,
      place,
      sponsored: false,
    }));
  if (groups.saved.length > 0) {
    items.push(
      { kind: 'title', key: 'title:saved', group: 'saved' },
      ...rows(groups.saved, 'saved'),
    );
  }
  if (groups.plan.length > 0) {
    items.push({ kind: 'title', key: 'title:plan', group: 'plan' }, { kind: 'plan', key: 'plan' });
  }
  if (groups.suggests.length > 0) {
    let suggests = rows(groups.suggests, 'suggests');
    const paid =
      sponsoredPoiId === null
        ? -1
        : groups.suggests.findIndex((place) => place.poiId === sponsoredPoiId);
    const entry = suggests[paid];
    if (paid >= 0 && entry?.kind === 'place' && groups.suggests.length > 1) {
      const rest = suggests.filter((_, index) => index !== paid);
      const at = Math.min(SPONSORED_AT, rest.length);
      suggests = [...rest.slice(0, at), { ...entry, sponsored: true }, ...rest.slice(at)];
    }
    items.push({ kind: 'title', key: 'title:suggests', group: 'suggests' }, ...suggests);
  }
  return items;
}
