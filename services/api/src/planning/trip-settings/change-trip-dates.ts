/**
 * `change_trip_dates` (docs/api-contracts-planning.md, commands): an organiser moves a trip that is
 * past setup to new dates from its settings ("Change it now"). Under the trip lock the trip takes
 * the new start, end and length, and the crew's plan follows as a new current version: each day
 * keeps its number, theme and area on its new date, a stop keeps its local time of day, and stops
 * on days the new dates no longer have go back to Ideas (one with no place of its own goes onto
 * the last day). Bookings keep their own times. The boost window follows and the crew is told.
 * Before the proposal, `lock_trip_dates` sets the dates instead.
 */
import { emitEvent } from '@cp/db';
import {
  changeTripDatesPayloadSchema,
  DATES_CHANGE_STATUSES,
  DomainError,
  TRIP_LENGTH_MAX_DAYS,
  type ChangeTripDatesResult,
  type MovedStop,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { backIdea } from '../../commands/ideas';
import { defineCommand } from '../../commands/_framework/define-command';
import { todayIn } from '../../commands/setup/shared';
import { lockTripStatus, requireOrganiser } from '../../commands/trips/removal-shared';
import { recomputeTrip } from '../../entitlements';
import { addDays, daysApart, onNewDates, placeOf } from '../../plan/draft-days';
import { commitPlanVersion, loadPlanState, lockTripPlan } from '../../plan/versioning';

const OPEN: ReadonlySet<string> = new Set(DATES_CHANGE_STATUSES);

interface DatesTrip {
  readonly crew_id: string;
  readonly tz: string | null;
  readonly start_date: string | null;
  readonly end_date: string | null;
}

/** The plan on its new dates, and where the stops that lost their day went. */
export async function planOnDates(
  tx: pg.PoolClient,
  input: {
    readonly baseVersionId: string;
    readonly state: PlanState;
    readonly start: string;
    readonly length: number;
    readonly tz: string;
    readonly tripId: string;
    readonly crewId: string;
    readonly actorId: string;
  },
): Promise<{ readonly next: PlanState; readonly moved: readonly MovedStop[] }> {
  const { state, length } = input;
  const before = new Map(state.days.map((day) => [day.day_no, day]));
  const moved: MovedStop[] = [];
  const shifting: PlanStateItem[] = [];
  const booked: PlanStateItem[] = [];
  for (const item of state.items) {
    if (item.booking_id != null) {
      // A booking is at its own time: it stays, on the last day when its day is gone.
      booked.push(item.day_no <= length ? item : { ...item, day_no: length });
      continue;
    }
    if (item.day_no <= length) {
      shifting.push(item);
      continue;
    }
    const place = item.poi_id == null ? null : await placeOf(tx, item.poi_id);
    if (place === null) {
      shifting.push({ ...item, day_no: length });
      moved.push({ stable_id: item.stable_id, to: 'day', day_no: length });
      continue;
    }
    await backIdea(tx, {
      tripId: input.tripId,
      crewId: input.crewId,
      uid: input.actorId,
      place,
      source: 'save',
    });
    moved.push({ stable_id: item.stable_id, to: 'ideas' });
  }
  const next: PlanState = {
    days: Array.from({ length }, (_, index) => {
      const day = before.get(index + 1);
      const area = day?.destination_id;
      return {
        day_no: index + 1,
        date: addDays(input.start, index),
        theme: day?.theme ?? null,
        ...(area == null ? {} : { destination_id: area }),
      };
    }),
    items: [
      ...(await onNewDates(tx, input.baseVersionId, input.start, input.tz, shifting)),
      ...booked,
    ],
  };
  return { next, moved };
}

export const changeTripDatesCommand = defineCommand({
  name: 'change_trip_dates',
  v: 1,
  schema: changeTripDatesPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: (tx, payload) => requireOrganiser(tx, payload.trip_id),
  handle: async (tx, payload, ctx): Promise<ChangeTripDatesResult> => {
    const status = await lockTripStatus(tx, payload.trip_id);
    if (!OPEN.has(status)) {
      throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: status });
    }
    const length = daysApart(payload.start, payload.end) + 1;
    if (length > TRIP_LENGTH_MAX_DAYS) {
      throw new DomainError('VALIDATION', { reason: 'trip_too_long', max: TRIP_LENGTH_MAX_DAYS });
    }
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<DatesTrip>(
        `SELECT t.crew_id, coalesce(t.tz, d.tz) AS tz, t.start_date::text AS start_date,
                t.end_date::text AS end_date
           FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
          WHERE t.id = $1`,
        [payload.trip_id],
      );
      const trip = rows[0];
      if (trip === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
      if (payload.start < todayIn(trip.tz, ctx.clock.serverNow)) {
        throw new DomainError('VALIDATION', { reason: 'dates_in_past' });
      }
      const same = trip.start_date === payload.start && trip.end_date === payload.end;
      const result = { trip_id: payload.trip_id, start: payload.start, end: payload.end };
      if (same) return { ...result, changed: false, moved_stops: [] };
      await tx.query(
        'UPDATE trips SET start_date = $2, end_date = $3, trip_length_days = $4 WHERE id = $1',
        [payload.trip_id, payload.start, payload.end, length],
      );
      const head = await lockTripPlan(tx, payload.trip_id);
      let moved: readonly MovedStop[] = [];
      if (head.currentVersionId !== null) {
        const shifted = await planOnDates(tx, {
          baseVersionId: head.currentVersionId,
          state: await loadPlanState(tx, head.currentVersionId),
          start: payload.start,
          length,
          tz: trip.tz ?? 'UTC',
          tripId: payload.trip_id,
          crewId: trip.crew_id,
          actorId: ctx.uid,
        });
        moved = shifted.moved;
        await commitPlanVersion(tx, {
          head,
          baseVersionId: head.currentVersionId,
          next: shifted.next,
          actor: { kind: 'user', id: ctx.uid },
          source: 'ops',
          opCount: 0,
          ops: null,
        });
      }
      await emitEvent(tx, {
        type: 'trip.dates_changed',
        aggregateKind: 'trip',
        aggregateId: payload.trip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: payload.trip_id,
        payload: { trip_id: payload.trip_id },
      });
      // The boost window follows the dates; recomputing notifies every member, which only the
      // server (no acting user) may publish.
      await tx.query("SELECT set_config('app.uid', '', true)");
      await recomputeTrip(tx, payload.trip_id);
      await tx.query("SELECT set_config('app.uid', $1, true)", [ctx.uid]);
      return { ...result, changed: true, moved_stops: [...moved] };
    });
  },
});
