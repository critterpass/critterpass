/**
 * Putting a day in an area, or back at its stop (docs/api-contracts-planning.md, commands). The
 * edit lands where the organiser's other plan edits land: on her private draft until the crew has
 * a plan (as `apply_draft_ops`), then as a new crew version (as `apply_plan_ops`). Stops of that
 * day on a place outside the day's new area go back to Ideas; a stop on a dropped pin and a booked
 * stop stay. Behind `trip.areas`.
 */
import { emitEvent, tripAreas } from '@cp/db';
import {
  DomainError,
  PLANNING_CONFIG_DEFAULTS,
  type MovedStop,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { backIdea, type IdeaPlace } from '../../commands/ideas';
import { refreshNumbers } from '../../commands/draft/versions';
import { draftChanged, lockTripDraft, writeDraftVersion } from '../../plan/draft-versioning';
import { commitPlanVersion, loadPlanState } from '../../plan/versioning';

const EDITABLE = new Set(['setup', 'draft_review']);
const GUIDE_WORKING = new Set(['drafting', 'redrafting']);

/** Refuses the command while day trips and several stops are switched off. */
export async function requireTripAreas(tx: pg.PoolClient): Promise<void> {
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ value: unknown }>("SELECT value FROM ops.ops_config WHERE key = 'trip.areas'"),
  );
  const on = rows[0] === undefined ? PLANNING_CONFIG_DEFAULTS['trip.areas'] : rows[0].value;
  if (on !== true) throw new DomainError('STATE_INVALID', { reason: 'trip_areas_off' });
}

interface Destination {
  readonly id: string;
  readonly tz: string | null;
  readonly currency: string | null;
  readonly coverage: string;
}

/** A destination with the trip's time zone and currency, for the same-zone, same-money rule. */
export async function loadPlaceRules(
  tx: pg.PoolClient,
  tripId: string,
  destinationIds: readonly string[],
): Promise<{
  trip: { tz: string | null; currency: string | null };
  places: Map<string, Destination>;
}> {
  const { rows } = await tx.query<{ tz: string | null; currency: string | null }>(
    `SELECT coalesce(t.tz, d.tz) AS tz, coalesce(t.local_currency, d.currency) AS currency
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [tripId],
  );
  const places = await tx.query<Destination>(
    'SELECT id, tz, currency, coverage FROM destinations WHERE id = ANY($1::uuid[])',
    [destinationIds],
  );
  return {
    trip: rows[0] ?? { tz: null, currency: null },
    places: new Map(places.rows.map((row) => [row.id, row])),
  };
}

/** `VALIDATION{other_time_zone | other_currency}` for a place that does not share the trip's. */
export function assertSameZoneAndMoney(
  trip: { tz: string | null; currency: string | null },
  place: Destination,
  detail: Record<string, unknown> = {},
): void {
  if (trip.tz !== null && place.tz !== null && trip.tz !== place.tz) {
    throw new DomainError('VALIDATION', { reason: 'other_time_zone', ...detail });
  }
  if (trip.currency !== null && place.currency !== null && trip.currency !== place.currency) {
    throw new DomainError('VALIDATION', { reason: 'other_currency', ...detail });
  }
}

export interface DayAreaChange {
  readonly tripId: string;
  readonly baseVersion: string;
  readonly dayNo: number;
  /** The new area; null puts the day back at its stop. */
  readonly areaId: string | null;
  readonly uid: string;
}

async function placesOf(
  tx: pg.PoolClient,
  items: readonly PlanStateItem[],
): Promise<Map<string, IdeaPlace & { destinationId: string }>> {
  const ids = items.flatMap((item) => (item.poi_id == null ? [] : [item.poi_id]));
  const { rows } = await tx.query<IdeaPlace & { destinationId: string }>(
    `SELECT id AS "poiId", name, name_local AS "nameLocal", category, lat, lng,
            destination_id AS "destinationId"
       FROM pois WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return new Map(rows.map((row) => [row.poiId ?? '', row]));
}

/** Runs the change under the trip lock, as the system; the caller checked the organiser. */
export async function changeDayArea(
  tx: pg.PoolClient,
  change: DayAreaChange,
): Promise<{ version_id: string; moved_stops?: MovedStop[] }> {
  await requireTripAreas(tx);
  return asSystemRole(tx, async () => {
    const head = await lockTripDraft(tx, change.tripId);
    const shared = head.currentVersionId !== null;
    const base = shared ? head.currentVersionId : head.draftVersionId;
    if (!shared) {
      if (GUIDE_WORKING.has(head.status)) {
        throw new DomainError('STATE_INVALID', { reason: 'draft_running', state: head.status });
      }
      if (!EDITABLE.has(head.status)) {
        throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: head.status });
      }
    }
    if (base === null) throw new DomainError('STATE_INVALID', { reason: 'no_plan' });
    if (base !== change.baseVersion) {
      throw new DomainError('PLAN_VERSION_CONFLICT', { latest: base });
    }
    const areas = await tripAreas(tx, change.tripId, base);
    const day = areas?.days.find((row) => row.dayNo === change.dayNo);
    if (areas === null || day === undefined) {
      throw new DomainError('VALIDATION', { reason: 'unknown_day' });
    }
    const stop = areas.stops.find((row) => row.position === day.stopPosition);
    const stopCity = stop?.destinationId ?? areas.destinationId;
    if (change.areaId !== null) await assertDayTrip(tx, change.tripId, stopCity, change.areaId);
    const newArea = change.areaId ?? stopCity;
    if (newArea === day.areaId) return { version_id: base };

    const state = await loadPlanState(tx, base);
    const onDay = state.items.filter((item) => item.day_no === change.dayNo);
    const places = await placesOf(tx, onDay);
    const moved: MovedStop[] = [];
    const leaving = new Set<string>();
    for (const item of onDay) {
      const place = item.poi_id == null ? undefined : places.get(item.poi_id);
      if (item.booking_id != null || place === undefined || place.destinationId === newArea) {
        continue;
      }
      const { destinationId: _area, ...idea } = place;
      await backIdea(tx, {
        tripId: change.tripId,
        crewId: head.crewId,
        uid: change.uid,
        place: idea,
        source: 'save',
      });
      leaving.add(item.stable_id);
      moved.push({ stable_id: item.stable_id, to: 'ideas' });
    }
    const next: PlanState = {
      days: state.days.map((row) => {
        if (row.day_no !== change.dayNo) return row;
        const { destination_id: _old, ...rest } = row;
        return change.areaId === null ? rest : { ...rest, destination_id: change.areaId };
      }),
      items: state.items.filter((item) => !leaving.has(item.stable_id)),
    };
    const versionId = shared
      ? await commitPlanVersion(tx, {
          head: { tripId: head.tripId, crewId: head.crewId, currentVersionId: base },
          baseVersionId: base,
          next,
          actor: { kind: 'user', id: change.uid },
          source: 'ops',
          opCount: 1,
          ops: null,
        })
      : await writeDraftEdit(tx, head, base, next, change.uid);
    await emitEvent(tx, {
      type: 'trip.areas_changed',
      aggregateKind: 'trip',
      aggregateId: head.tripId,
      actorKind: 'user',
      actorId: change.uid,
      crewId: head.crewId,
      tripId: head.tripId,
      payload: { trip_id: head.tripId },
    });
    return moved.length === 0
      ? { version_id: versionId }
      : { version_id: versionId, moved_stops: moved };
  });
}

async function writeDraftEdit(
  tx: pg.PoolClient,
  head: Awaited<ReturnType<typeof lockTripDraft>>,
  base: string,
  next: PlanState,
  uid: string,
): Promise<string> {
  const versionId = await writeDraftVersion(tx, {
    head,
    baseVersionId: base,
    next,
    origin: 'hand',
  });
  const { rows } = await tx.query<{ members: number }>(
    `SELECT count(*)::int AS members FROM trip_participants
      WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')`,
    [head.tripId],
  );
  await refreshNumbers(tx, versionId, Math.max(1, rows[0]?.members ?? 1));
  await draftChanged(tx, { head, versionId, baseVersionId: base, opCount: 1, actorId: uid });
  return versionId;
}

/** The area must be a day trip from the day's stop, in the trip's time zone and currency. */
async function assertDayTrip(
  tx: pg.PoolClient,
  tripId: string,
  stopCity: string,
  areaId: string,
): Promise<void> {
  const { rows } = await tx.query(
    `SELECT 1 FROM destination_links
      WHERE from_destination_id = $1 AND to_destination_id = $2 AND kind = 'day_trip'`,
    [stopCity, areaId],
  );
  if (rows.length === 0) throw new DomainError('VALIDATION', { reason: 'not_a_day_trip' });
  const rules = await loadPlaceRules(tx, tripId, [areaId]);
  const area = rules.places.get(areaId);
  if (area === undefined) throw new DomainError('VALIDATION', { reason: 'not_a_day_trip' });
  assertSameZoneAndMoney(rules.trip, area);
}
