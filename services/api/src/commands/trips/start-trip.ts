/**
 * `start_trip` (docs/api-contracts.md §4.7): the organiser starts a trip nobody's landing or arrival
 * has started, from the day before its first day (the trip's own clock). A `confirmed` trip walks
 * through `pre_trip` on the way, one `trip.status_changed` per step, in this one transaction; a
 * trip already under way answers `started: false`. A `proposed` trip is refused: nobody has said
 * IN yet, and eggs and splits follow the RSVPs.
 */
import { moveTripStatus } from '@cp/db';
import {
  DomainError,
  startTripPayloadSchema,
  type StartTripPayload,
  type StartTripResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

const STARTABLE = new Set(['confirmed', 'pre_trip']);

interface StartRow {
  readonly status: string;
  readonly organiser: boolean;
  readonly open: boolean;
}

/** The trip as the caller sees it, and whether its day-before has begun on the trip's clock. */
async function loadTrip(tx: pg.PoolClient, tripId: string, now: Date): Promise<StartRow> {
  const { rows } = await tx.query<StartRow>(
    `SELECT t.status, app.is_trip_organiser(t.id) AS organiser,
            t.start_date IS NOT NULL
              AND ((t.start_date - 1)::timestamp AT TIME ZONE coalesce(t.tz, d.tz, 'UTC')) <= $2
              AS open
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId, now],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  return row;
}

export const startTripCommand = defineCommand({
  name: 'start_trip',
  v: 1,
  schema: startTripPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload: StartTripPayload, ctx) => {
    const trip = await loadTrip(tx, payload.trip_id, ctx.clock.serverNow);
    if (!trip.organiser) throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  },
  handle: async (tx, payload, ctx): Promise<StartTripResult> => {
    const trip = await loadTrip(tx, payload.trip_id, ctx.clock.serverNow);
    const result = { trip_id: payload.trip_id, status: 'in_trip' as const };
    if (trip.status === 'in_trip') return { ...result, started: false };
    if (!STARTABLE.has(trip.status)) {
      throw new DomainError('STATE_INVALID', { reason: 'trip_status', state: trip.status });
    }
    if (!trip.open) throw new DomainError('STATE_INVALID', { reason: 'before_start_date' });
    const actor = { kind: 'user' as const, id: ctx.uid };
    return asSystemRole(tx, async () => {
      const tripId = payload.trip_id;
      await moveTripStatus(tx, { tripId, from: 'confirmed', to: 'pre_trip', actor });
      const started = await moveTripStatus(tx, { tripId, from: 'pre_trip', to: 'in_trip', actor });
      if (!started) throw new DomainError('STATE_INVALID', { reason: 'trip_status' });
      return { ...result, started: true };
    });
  },
});
