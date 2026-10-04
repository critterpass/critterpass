/**
 * The next free window in the trip's plan, from synced rows on the phone, so the gaps card follows
 * the plan as the days fill and reads the same offline. Null while there is no plan, nothing ahead
 * is free, or the rows are still loading (`loaded` tells them apart).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import { textArray } from '@/data/ideas/use-trip-ideas';

import { useLiveRows } from '../data/live-rows';
import { planGaps, type PlanGap } from './plan-gaps';
import { nextGap } from './trip-explore-model';

const TRIP_SQL = `SELECT t.current_version_id AS version_id, coalesce(t.tz, d.tz, 'UTC') AS tz,
    coalesce(d.drive_factor, 1) AS drive_factor
  FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = ?`;
const TRIP_TABLES = ['trips', 'destinations'];

const DAYS_SQL = `SELECT id AS day_id, day_no, date FROM plan_days WHERE version_id = ?
  ORDER BY day_no`;
const ITEMS_SQL = `SELECT i.stable_id, i.day_id, i.poi_id, coalesce(p.category, i.category) AS category,
    i.starts_at, i.ends_at, i.attendee_ids,
    (i.booking_id IS NOT NULL OR i.locked_reason IS NOT NULL) AS locked, i.is_outdoor,
    coalesce(p.lat, json_extract(i.custom_place, '$.lat')) AS lat,
    coalesce(p.lng, json_extract(i.custom_place, '$.lng')) AS lng,
    coalesce(p.name, json_extract(i.custom_place, '$.name')) AS name
  FROM plan_items i LEFT JOIN pois p ON p.id = i.poi_id
  WHERE i.version_id = ? AND coalesce(i.status, '') <> 'cancelled'`;
const PLAN_TABLES = ['plan_days', 'plan_items', 'pois'];

/** The trip's voters, as the server counts them: seat holders when two or more hold one. */
const PEOPLE_SQL = `SELECT m.user_id, coalesce(p.holds_seat, 0) AS seat
  FROM trips t JOIN crew_members m ON m.crew_id = t.crew_id AND m.status = 'active'
    LEFT JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = m.user_id
  WHERE t.id = ? ORDER BY m.user_id`;
const PEOPLE_TABLES = ['trips', 'crew_members', 'trip_participants'];

interface ItemRow {
  readonly stable_id: string;
  readonly day_id: string;
  readonly poi_id: string | null;
  readonly category: string | null;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly attendee_ids: string | null;
  readonly locked: number;
  readonly is_outdoor: number | null;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly name: string | null;
}

/** The minute, refreshed every minute, so a gap that starts drops off the card. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function useNextGap(tripId: string): {
  readonly loaded: boolean;
  /** The plan has at least one timed item. */
  readonly hasPlan: boolean;
  readonly gap: PlanGap | null;
} {
  const trip = useLiveRows<{ version_id: string | null; tz: string; drive_factor: number }>(
    TRIP_SQL,
    [tripId],
    TRIP_TABLES,
  );
  const versionId = trip.rows[0]?.version_id ?? null;
  const days = useLiveRows<{ day_id: string; day_no: number; date: string | null }>(
    DAYS_SQL,
    versionId === null ? null : [versionId],
    PLAN_TABLES,
  );
  const items = useLiveRows<ItemRow>(
    ITEMS_SQL,
    versionId === null ? null : [versionId],
    PLAN_TABLES,
  );
  const people = useLiveRows<{ user_id: string; seat: number }>(
    PEOPLE_SQL,
    [tripId],
    PEOPLE_TABLES,
  );
  const now = useMinute();
  const tz = trip.rows[0]?.tz ?? 'UTC';
  const driveFactor = trip.rows[0]?.drive_factor ?? 1;

  const gaps = useMemo(() => {
    if (versionId === null || days.rows.length === 0) return [];
    const seats = people.rows.filter((row) => row.seat === 1).map((row) => row.user_id);
    return planGaps({
      tz,
      driveFactor,
      participants: seats.length > 1 ? seats : people.rows.map((row) => row.user_id),
      days: days.rows,
      items: items.rows.map((row) => ({
        ...row,
        attendee_ids: textArray(row.attendee_ids),
        locked: row.locked === 1,
        is_outdoor: row.is_outdoor === 1,
      })),
    });
  }, [days.rows, driveFactor, items.rows, people.rows, tz, versionId]);

  const wall = toLocalWallTime(now, tz);
  const [hours, minutes] = wall.time.split(':');
  const minute = Number(hours) * 60 + Number(minutes);
  const gap = useMemo(() => nextGap(gaps, { date: wall.date, minute }), [gaps, minute, wall.date]);
  const loaded =
    trip.loaded && people.loaded && (versionId === null || (days.loaded && items.loaded));
  const hasPlan = items.rows.some((row) => row.starts_at !== null);
  return { loaded, hasPlan, gap };
}
