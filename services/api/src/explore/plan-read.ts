/**
 * Plan and place reads for the explore routes and the swipe match: the trip's current plan as
 * slot-finder days (timed items in local minutes), the stay's position, and where a place already
 * sits in the plan. Read as the caller: RLS shows a member the crew-visible version only.
 */
import { DomainError, toLocalWallTime } from '@cp/domain';
import type pg from 'pg';

import type { SlotDay } from './slot-suggest';

export interface TripFacts {
  readonly id: string;
  readonly tz: string | null;
  readonly destination_id: string | null;
  readonly current_version_id: string | null;
  readonly start_date: string | null;
  readonly organiser: boolean;
}

export interface PlaceFacts {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly hours: unknown;
  readonly tz: string | null;
  readonly timeNeededMin: number | null;
}

export async function placeFacts(tx: pg.PoolClient, poiId: string): Promise<PlaceFacts> {
  const { rows } = await tx.query<PlaceFacts>(
    `SELECT p.name, p.lat, p.lng, p.hours, coalesce(p.timezone, d.tz) AS tz,
            (p.editorial->>'time_needed_min')::int AS "timeNeededMin"
       FROM pois p JOIN destinations d ON d.id = p.destination_id
      WHERE p.id = $1 AND p.status = 'active'`,
    [poiId],
  );
  const place = rows[0];
  if (place === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi' });
  return place;
}

export interface PlanSlots {
  readonly days: SlotDay[];
  readonly firstDate: string | null;
  readonly stay: { readonly lat: number; readonly lng: number } | null;
  readonly inPlan: {
    readonly day_no: number;
    readonly stable_id: string;
    readonly starts_at: string | null;
  } | null;
}

const localMinutes = (at: Date, tz: string): number => {
  const [h, m] = toLocalWallTime(at, tz).time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export async function loadSlotDays(
  tx: pg.PoolClient,
  trip: Pick<TripFacts, 'current_version_id'>,
  poiId: string,
  tz: string,
): Promise<PlanSlots> {
  if (trip.current_version_id === null)
    return { days: [], firstDate: null, stay: null, inPlan: null };
  const { rows: days } = await tx.query<{ day_no: number; date: string | null }>(
    `SELECT day_no, to_char(date, 'YYYY-MM-DD') AS date FROM plan_days
      WHERE version_id = $1 ORDER BY day_no`,
    [trip.current_version_id],
  );
  const { rows: items } = await tx.query<{
    day_no: number;
    stable_id: string;
    poi_id: string | null;
    starts_at: Date | null;
    ends_at: Date | null;
    category: string | null;
    lat: number | null;
    lng: number | null;
  }>(
    `SELECT d.day_no, i.stable_id, i.poi_id, i.starts_at, i.ends_at, p.category, p.lat, p.lng
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id LEFT JOIN pois p ON p.id = i.poi_id
      WHERE i.version_id = $1 AND i.status IS DISTINCT FROM 'cancelled'
      ORDER BY d.day_no, i.starts_at NULLS LAST, i.stable_id`,
    [trip.current_version_id],
  );
  const stayRow = items.find((item) => item.category === 'stay' && item.lat !== null);
  const here = items.find((item) => item.poi_id === poiId);
  return {
    days: days.map((day) => ({
      day_no: day.day_no,
      date: day.date,
      busy: items
        .filter((item) => item.day_no === day.day_no && item.category !== 'stay')
        .flatMap((item) =>
          item.starts_at === null || item.ends_at === null
            ? []
            : [{ start: localMinutes(item.starts_at, tz), end: localMinutes(item.ends_at, tz) }],
        ),
    })),
    firstDate: days.find((day) => day.date !== null)?.date ?? null,
    stay: stayRow === undefined ? null : { lat: stayRow.lat ?? 0, lng: stayRow.lng ?? 0 },
    inPlan:
      here === undefined
        ? null
        : {
            day_no: here.day_no,
            stable_id: here.stable_id,
            starts_at: here.starts_at?.toISOString() ?? null,
          },
  };
}
