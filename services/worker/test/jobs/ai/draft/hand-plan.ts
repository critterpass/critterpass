/**
 * A plan the organiser started by hand on the recorded Kyoto trip: an organiser-only draft with a
 * day per trip date, on which the suites place her stops (a place of ours or a dropped pin, timed
 * or not yet).
 */
import type pg from 'pg';

import { RECORDING } from './kyoto-trip';

const { start, days: dayCount } = RECORDING.crew;

/** The trip's `dayNo`th date. */
export const dateOf = (dayNo: number): string =>
  new Date(Date.parse(`${start}T00:00:00Z`) + (dayNo - 1) * 86_400_000).toISOString().slice(0, 10);

/** An hour of that day in Kyoto. */
export const kyoto = (dayNo: number, hour: number): Date =>
  new Date(`${dateOf(dayNo)}T${String(hour).padStart(2, '0')}:00:00+09:00`);

/** Her empty plan as the trip's draft; returns its id. */
export async function seedHandPlan(pool: pg.Pool, tripId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status, origin, coverage)
     VALUES ($1, 'organiser', 'draft', 'hand', $2) RETURNING id`,
    [tripId, JSON.stringify({ places: {} })],
  );
  const id = rows[0]?.id as string;
  for (let dayNo = 1; dayNo <= dayCount; dayNo += 1) {
    await pool.query(
      'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, $3, $4)',
      [id, tripId, dayNo, dateOf(dayNo)],
    );
  }
  await pool.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, id]);
  return id;
}

export interface HandStop {
  readonly stableId: string;
  readonly dayNo: number;
  /** Local hours it runs from and to; null for a stop she has not timed yet. */
  readonly hours: readonly [number, number] | null;
  readonly place: { poiId: string } | { pin: { name: string; lat: number; lng: number } };
  readonly attendees?: readonly string[];
  /** `food` for a meal of hers; a stop otherwise. */
  readonly category?: string;
}

export async function addHandStop(
  pool: pg.Pool,
  plan: { readonly versionId: string; readonly tripId: string },
  stop: HandStop,
): Promise<void> {
  await pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, poi_id,
       custom_place, attendee_ids, category, created_by_kind, notes)
     SELECT $1, d.id, $2, $3, $5, $6, 'Asia/Tokyo', $7, $8, $9, $10, 'user', 'Mine'
       FROM plan_days d WHERE d.version_id = $1 AND d.day_no = $4`,
    [
      plan.versionId,
      plan.tripId,
      stop.stableId,
      stop.dayNo,
      stop.hours === null ? null : kyoto(stop.dayNo, stop.hours[0]),
      stop.hours === null ? null : kyoto(stop.dayNo, stop.hours[1]),
      'poiId' in stop.place ? stop.place.poiId : null,
      'pin' in stop.place ? JSON.stringify(stop.place.pin) : null,
      stop.attendees ?? null,
      stop.category ?? 'other',
    ],
  );
}
