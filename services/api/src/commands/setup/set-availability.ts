/**
 * `set_availability` (docs/api-contracts.md §4.5): a member's own date-level days, from manual
 * marks or their device calendar's on-device reduction. Only the owner's `calendar_days` rows are
 * written (as the member: RLS is the backstop); the crew learns counts only, once the trip's window
 * recompute (queued here for every trip they are setting up) has run. The event names trips and a
 * day count, never a date.
 */
import { emitEvent } from '@cp/db';
import {
  AVAILABILITY_HORIZON_DAYS,
  DomainError,
  setAvailabilityPayloadSchema,
  type SetAvailabilityPayload,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { draftAgainWithNewAnswers } from '../draft/as-you-go';
import {
  addDays,
  MEMBER_INPUT_STATUSES,
  openSetupTripIds,
  queueWindowRecompute,
  refreshMemberSetup,
  requireSetupMember,
  requireStatus,
  todayIn,
} from './shared';

export interface SetAvailabilityResult {
  readonly days: number;
  readonly trip_ids: readonly string[];
}

function inHorizon(date: string, today: string): boolean {
  return date >= addDays(today, -1) && date <= addDays(today, AVAILABILITY_HORIZON_DAYS + 7);
}

async function touchSource(
  tx: pg.PoolClient,
  uid: string,
  kind: 'device' | 'manual',
  consent: boolean | undefined,
  now: Date,
): Promise<void> {
  await tx.query(
    `INSERT INTO calendar_sources (user_id, kind, last_sync_at, consent_tentative)
     VALUES ($1, $2, $3, coalesce($4, false))
     ON CONFLICT (user_id, kind) DO UPDATE
       SET last_sync_at = EXCLUDED.last_sync_at,
           consent_tentative = coalesce($4, calendar_sources.consent_tentative)`,
    [uid, kind, now, consent ?? null],
  );
}

export const setAvailabilityCommand = defineCommand({
  name: 'set_availability',
  v: 1,
  schema: setAvailabilityPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload: SetAvailabilityPayload, ctx) => {
    if (payload.trip_id === undefined) return;
    const trip = await requireSetupMember(tx, payload.trip_id, ctx.uid);
    requireStatus(trip, MEMBER_INPUT_STATUSES);
  },
  handle: async (tx, payload, ctx): Promise<SetAvailabilityResult> => {
    const now = ctx.clock.serverNow;
    const today = todayIn(ctx.device.tz, now);
    const outside = [...payload.days.map((d) => d.date), ...(payload.clear ?? [])].filter(
      (date) => !inHorizon(date, today),
    );
    if (outside.length > 0) {
      throw new DomainError('VALIDATION', { reason: 'outside_horizon', count: outside.length });
    }
    for (const day of payload.days) {
      const mayAsk = day.state === 'maybe' && (day.may_ask ?? true);
      await tx.query(
        `INSERT INTO calendar_days (user_id, trip_id, date, state, source, guide_may_ask)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, date) DO UPDATE
           SET state = EXCLUDED.state, source = EXCLUDED.source,
               guide_may_ask = EXCLUDED.guide_may_ask,
               trip_id = coalesce(EXCLUDED.trip_id, calendar_days.trip_id)`,
        [ctx.uid, payload.trip_id ?? null, day.date, day.state, day.source, mayAsk],
      );
    }
    if ((payload.clear ?? []).length > 0) {
      await tx.query(
        `UPDATE calendar_days SET state = 'unknown', guide_may_ask = false
          WHERE user_id = $1 AND date = ANY($2::date[])`,
        [ctx.uid, payload.clear],
      );
    }
    if (
      payload.days.some((d) => d.source === 'device_cal') ||
      payload.consent_tentative !== undefined
    ) {
      await touchSource(tx, ctx.uid, 'device', payload.consent_tentative, now);
    }
    if (payload.days.some((d) => d.source === 'manual')) {
      await touchSource(tx, ctx.uid, 'manual', undefined, now);
    }
    const tripIds = await openSetupTripIds(tx, ctx.uid);
    const ordered =
      payload.trip_id === undefined
        ? tripIds
        : [payload.trip_id, ...tripIds.filter((id) => id !== payload.trip_id)];
    for (const tripId of ordered) {
      await queueWindowRecompute(tx, tripId);
      if ((await asSystemRole(tx, () => refreshMemberSetup(tx, tripId))) > 0) {
        await draftAgainWithNewAnswers(tx, tripId, ctx.uid);
      }
    }
    await emitEvent(tx, {
      type: 'availability.updated',
      aggregateKind: 'user',
      aggregateId: ctx.uid,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        user_id: ctx.uid,
        trip_ids: ordered,
        days_count: payload.days.length + (payload.clear ?? []).length,
      },
    });
    return { days: payload.days.length, trip_ids: ordered };
  },
});
