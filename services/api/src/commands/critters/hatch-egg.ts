/**
 * `hatch_egg` from a device: the arrival geofence at the destination (`arrived`) or the manual
 * "Hatch it" button (`manual`, only once the trip is under way and the traveller's own date has
 * reached its start). Landing hatches from the worker. Whichever comes first hatches; the others,
 * and a second device, find it hatched and change nothing.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  hatchEggPayloadSchema,
  toLocalWallTime,
  type HatchEggPayload,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { announceFinds, requireTripSeat } from './shared';

export interface HatchResult {
  readonly egg_id: string | null;
  readonly form_id: string | null;
  readonly hatched: boolean;
}

interface HatchRow {
  readonly egg_id: string;
  readonly form_id: string;
  readonly entry_id: string | null;
  readonly hatched: boolean;
}

/** Hatches as app_system and announces it; shared by every trigger. */
export async function hatchFor(
  tx: pg.PoolClient,
  input: {
    readonly tripId: string;
    readonly uid: string;
    readonly trigger: string;
    readonly now: Date;
  },
): Promise<HatchResult> {
  const { rows } = await tx.query<HatchRow>('SELECT * FROM app.hatch_egg($1, $2, $3)', [
    input.uid,
    input.tripId,
    input.trigger,
  ]);
  const row = rows[0];
  if (row === undefined) return { egg_id: null, form_id: null, hatched: false };
  if (row.hatched) {
    await appendDomainEvent(tx, {
      type: 'egg.hatched',
      aggregateKind: 'egg',
      aggregateId: row.egg_id,
      actorKind: 'user',
      actorId: input.uid,
      tripId: input.tripId,
      payload: {
        trip_id: input.tripId,
        user_id: input.uid,
        egg_id: row.egg_id,
        form_id: row.form_id,
        trigger: input.trigger,
      },
    });
    if (row.entry_id !== null) await announceFinds(tx, [row.entry_id], input.now);
  }
  return { egg_id: row.egg_id, form_id: row.form_id, hatched: row.hatched };
}

export const hatchEggCommand = defineCommand({
  name: 'hatch_egg',
  v: 1,
  schema: hatchEggPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: HatchEggPayload, ctx) => {
    const seat = await requireTripSeat(tx, payload.trip_id, ctx.uid);
    if (payload.trigger === 'arrived') {
      if (seat.status !== 'pre_trip' && seat.status !== 'in_trip') {
        throw new DomainError('STATE_INVALID', { reason: 'trip_not_travelling' });
      }
      return;
    }
    if (seat.status !== 'in_trip')
      throw new DomainError('STATE_INVALID', { reason: 'trip_not_started' });
    const today = toLocalWallTime(ctx.clock.serverNow, ctx.device.tz).date;
    if (seat.start_date !== null && today < seat.start_date) {
      throw new DomainError('STATE_INVALID', { reason: 'before_start_date' });
    }
  },
  handle: (tx, payload, ctx) =>
    asSystemRole(tx, () =>
      hatchFor(tx, {
        tripId: payload.trip_id,
        uid: ctx.uid,
        trigger: payload.trigger,
        now: ctx.clock.serverNow,
      }),
    ),
});
