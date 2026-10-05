/**
 * Search on the trip's own days. On a day of the trip she is somewhere: rows run nearest first,
 * from where she is (the phone's last known spot) or else from the day's next stop, so "ca phe"
 * does not lead with a café up a mountain pass. A search opened for a day keeps that day: a
 * place's fit line names that day when the place fits it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime, type PlaceFit } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

import { useMyPosition } from '../hooks/use-my-position';
import { metresBetween, type Point } from './search-rows';
import type { SearchTrip } from './use-search-trip';

const NEXT_STOP_SQL = `SELECT p.lat, p.lng FROM plan_items i JOIN pois p ON p.id = i.poi_id
  WHERE i.version_id = ? AND julianday(i.starts_at) > julianday(?) AND i.status <> 'cancelled'
  ORDER BY i.starts_at LIMIT 1`;

/** Whether `now` falls on one of the trip's days, in the trip's zone. */
export function onTripDay(trip: Pick<SearchTrip, 'days' | 'tz'>, now: Date): boolean {
  const today = toLocalWallTime(now, trip.tz).date;
  return trip.days.some((day) => day.date === today);
}

/** Where a trip day's search measures from: her spot, else the day's next stop; null off-trip. */
export function useTripDayPoint(trip: SearchTrip): Point | null {
  const position = useMyPosition();
  const nowIso = useMemo(() => new Date().toISOString(), []);
  const today = onTripDay(trip, new Date(nowIso));
  const next = useLiveRows<{ lat: number | null; lng: number | null }>(
    NEXT_STOP_SQL,
    today && trip.versionId !== null ? [trip.versionId, nowIso] : null,
    ['plan_items', 'pois'],
  ).rows[0];
  if (!today) return null;
  const stop = next?.lat == null || next.lng == null ? null : { lat: next.lat, lng: next.lng };
  return tripDayFrom(position.kind === 'at' ? position.point : null, stop);
}

/** Her spot is too far from the day's stops to be where the trip is (a phone left at home). */
export const AWAY_M = 100_000;

/** Where to measure from: her spot when she is near the day's next stop (or there is none). */
export function tripDayFrom(here: Point | null, nextStop: Point | null): Point | null {
  if (here === null) return nextStop;
  if (nextStop === null) return here;
  return metresBetween(here, nextStop) <= AWAY_M ? here : nextStop;
}

/** `rows` nearest first from `from`; rows with no spot keep their order after the rest. */
export function nearestRows<T extends { readonly lat: number | null; readonly lng: number | null }>(
  rows: readonly T[],
  from: Point | null,
): T[] {
  if (from === null) return [...rows];
  const metres = (row: T) =>
    row.lat === null || row.lng === null
      ? Number.POSITIVE_INFINITY
      : metresBetween(from, { lat: row.lat, lng: row.lng });
  return rows
    .map((row, index) => ({ row, index, metres: metres(row) }))
    .sort((a, b) => a.metres - b.metres || a.index - b.index)
    .map((entry) => entry.row);
}

/** The fit with the day a search was opened for as its best, when the place fits that day. */
export function fitForDay(fit: PlaceFit | null, dayId: string | null | undefined): PlaceFit | null {
  if (fit === null || dayId === null || dayId === undefined) return fit;
  const day = fit.days.find((entry) => entry.day_id === dayId);
  if (day === undefined || day.grade === 'no' || day.slot === null) return fit;
  return {
    ...fit,
    best: { day_id: day.day_id, day_no: day.day_no, grade: day.grade, slot: day.slot },
  };
}
