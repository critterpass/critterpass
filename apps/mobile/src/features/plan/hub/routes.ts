/**
 * The plan's section 7 routes under the trip (`/{tripId}/...`): the trip map with its sheet at a
 * snap (7a-1 peek, 7a-2 half, 7a-3 full; 7i-1 when nothing is saved), a day plan (7b-1), its map
 * open (7b-2) and all days (7b-3). The day plan shares the day's path with the earlier day view
 * (3e-2); the route picks one by `planning.redesign`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and params, never copy. */
import type { Href } from 'expo-router';

import type { MapSheetSnap } from '@/ui/sheet/map-sheet-snap';

export interface TripMapParams {
  /** The day the sheet opens on. */
  readonly day?: number | undefined;
  readonly sheet?: MapSheetSnap | undefined;
}

export const tripPlanRoutes = {
  /** What PLAN opens: the hub (`plan.hub`), or the earlier overview with the switch off. */
  hub: (tripId: string): Href => ({ pathname: '/[tripId]/plan', params: { tripId } }),
  map: (tripId: string, params: TripMapParams = {}): Href => ({
    pathname: '/[tripId]/plan/map',
    params: {
      tripId,
      ...(params.day === undefined ? {} : { day: String(params.day) }),
      ...(params.sheet === undefined ? {} : { sheet: params.sheet }),
    },
  }),
  /** All days; `from` is the day it was opened from (its ← goes back there). */
  days: (tripId: string, from?: number): Href => ({
    pathname: '/[tripId]/plan/days',
    params: { tripId, ...(from === undefined ? {} : { from: String(from) }) },
  }),
  day: (tripId: string, dayNo: number, item?: string): Href => ({
    pathname: '/[tripId]/day/[day]',
    params: { tripId, day: String(dayNo), ...(item === undefined ? {} : { item }) },
  }),
  dayMap: (tripId: string, dayNo: number): Href => ({
    pathname: '/[tripId]/day/[day]/map',
    params: { tripId, day: String(dayNo) },
  }),
};

const SNAPS: readonly MapSheetSnap[] = ['peek', 'half', 'full'];

/** A `sheet` query value as a snap; anything else opens at peek. */
export function sheetParam(value: string | undefined): MapSheetSnap {
  return SNAPS.find((snap) => snap === value) ?? 'peek';
}

/** A `day` query value as a day number, or null. */
export function dayParam(value: string | undefined): number | null {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n > 0 ? n : null;
}
