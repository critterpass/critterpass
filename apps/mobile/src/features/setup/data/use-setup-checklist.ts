/**
 * The setup checklist from synced rows, offline: each member's part (`trip_member_setup`: their
 * days and max as flags, their way there), who has a must-do, whether the budget and the rooms
 * are locked, the trip's stops and the route switch, and the days of the organiser's draft that
 * hold a stop (`trips.sketched_days`, the only thing members learn of her private draft).
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useMemo } from 'react';

import { useTripAreasOn } from '@/data/areas/use-trip-areas';

import { setupChecklist, sketchTiles, type MemberProgress, type SetupChecklist } from './checklist';
import { parseIdList, useLiveRows } from './rows';
import type { SetupTrip } from './setup-trip';

const PARTS_SQL = `SELECT user_id, days_in, max_in, way_mode, way_from, way_arrives_at,
    way_estimate_minor, way_currency, way_booking_id
  FROM trip_member_setup WHERE trip_id = ?`;
const PARTS_TABLES = ['trip_member_setup'];

const MUST_DO_SQL = `SELECT owner_id, co_owner_ids FROM must_dos
  WHERE trip_id = ? AND deleted_at IS NULL`;
const MUST_DO_TABLES = ['must_dos'];

const LOCKS_SQL = `SELECT
    (SELECT count(*) FROM budget_plans b WHERE b.trip_id = t.id AND b.locked_at IS NOT NULL
       AND coalesce(b.is_stale, 0) = 0) AS budget_locked,
    (SELECT count(*) FROM room_plans r WHERE r.trip_id = t.id AND r.locked_at IS NOT NULL
       AND coalesce(r.is_stale, 0) = 0) AS rooms_locked,
    (SELECT count(*) FROM trip_stops s WHERE s.trip_id = t.id) AS stops,
    t.sketched_days
  FROM trips t WHERE t.id = ?`;
const LOCKS_TABLES = ['budget_plans', 'room_plans', 'trip_stops', 'trips'];

interface PartRow {
  readonly user_id: string;
  readonly days_in: number | null;
  readonly max_in: number | null;
  readonly way_mode: string | null;
  readonly way_from: string | null;
  readonly way_arrives_at: string | null;
  readonly way_estimate_minor: number | string | null;
  readonly way_currency: string | null;
  readonly way_booking_id: string | null;
}

interface LocksRow {
  readonly budget_locked: number;
  readonly rooms_locked: number;
  readonly stops: number;
  readonly sketched_days: string | null;
}

export interface SetupChecklistView extends SetupChecklist {
  readonly progress: ReadonlyMap<string, MemberProgress>;
  readonly tiles: readonly { readonly dayNo: number; readonly sketched: boolean }[];
}

export function progressOf(rows: readonly PartRow[]): Map<string, MemberProgress> {
  return new Map(
    rows.map((row) => [
      row.user_id,
      {
        daysIn: row.days_in === 1,
        maxIn: row.max_in === 1,
        way:
          row.way_mode === null
            ? null
            : {
                mode: row.way_mode,
                from: row.way_from,
                arrivesAt: row.way_arrives_at,
                estimateMinor:
                  row.way_estimate_minor === null ? null : Number(row.way_estimate_minor),
                currency: row.way_currency,
                bookingId: row.way_booking_id,
              },
      },
    ]),
  );
}

/** The checklist for a trip; `undefined` while its rows load. */
export function useSetupChecklist(
  trip: SetupTrip | null | undefined,
): SetupChecklistView | undefined {
  const tripId = trip?.tripId ?? null;
  const params = tripId === null ? null : [tripId];
  const parts = useLiveRows<PartRow>(PARTS_SQL, params, PARTS_TABLES);
  const mustDos = useLiveRows<{ owner_id: string; co_owner_ids: string | null }>(
    MUST_DO_SQL,
    params,
    MUST_DO_TABLES,
  );
  const locks = useLiveRows<LocksRow>(LOCKS_SQL, params, LOCKS_TABLES);
  const routeOn = useTripAreasOn();
  return useMemo(() => {
    if (trip === null || trip === undefined) return undefined;
    if (!parts.loaded || !mustDos.loaded || !locks.loaded) return undefined;
    const owners = new Set<string>();
    for (const row of mustDos.rows) {
      owners.add(row.owner_id);
      for (const uid of parseIdList(row.co_owner_ids)) owners.add(uid);
    }
    const progress = progressOf(parts.rows);
    const lock = locks.rows[0];
    const checklist = setupChecklist({
      members: trip.members.map((member) => member.uid),
      me: trip.me,
      isOrganiser: trip.isOrganiser,
      isSolo: trip.isSolo,
      datesLocked: trip.startDate !== null && trip.endDate !== null,
      progress,
      mustDoOwners: owners,
      budgetLocked: (lock?.budget_locked ?? 0) > 0,
      roomsLocked: (lock?.rooms_locked ?? 0) > 0,
      routeOn,
      stopCount: lock?.stops ?? 0,
    });
    const sketched = parseIdList(lock?.sketched_days ?? null).map(Number);
    return { ...checklist, progress, tiles: sketchTiles(trip.lengthDays, sketched) };
  }, [trip, parts, mustDos, locks, routeOn]);
}
