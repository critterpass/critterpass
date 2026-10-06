/**
 * `lock_trip_dates` and `set_setup_step` (docs/api-contracts.md §4.5; the setup step machine in
 * docs/data-model-sync-and-privacy.md §3.1). Locking dates sets the trip's start, end and length,
 * moves a `won` trip into setup, advances the step past WHEN, recomputes the boost window, and
 * marks what was priced for other dates stale (budget plan, room plan, must-do fits). Moving the
 * step goes back to any earlier step (re-opening it, with the same downstream staleness) or forward
 * past one that does not apply.
 */
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  lockTripDatesPayloadSchema,
  resolveSetupStep,
  setSetupStepPayloadSchema,
  SETUP_QUEUES,
  SETUP_RT,
  staleAfterReopen,
  stepIndex,
  TRIP_LENGTH_MAX_DAYS,
  type TripSetupStep,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { recomputeTrip } from '../../entitlements';
import { ensureDraftDays, reshapeDraftDays } from '../../plan/draft-days';
import { lockTripDraft } from '../../plan/draft-versioning';
import { defineCommand } from '../_framework/define-command';
import {
  daysBetween,
  loadSetupTrip,
  publishSetup,
  queueBudgetRecompute,
  requireOrganiser,
  requireStatus,
  setupMemberIds,
  SETUP_OPEN_STATUSES,
  todayIn,
  type SetupTrip,
} from './shared';
import { queueFitChecks } from './must-do-fit';

/** Marks what the re-opened step invalidates; runs as the server. */
export async function markStale(
  tx: pg.PoolClient,
  tripId: string,
  what: readonly ('budget' | 'rooms' | 'fits')[],
): Promise<void> {
  if (what.includes('budget')) {
    await tx.query('UPDATE budget_plans SET is_stale = true WHERE trip_id = $1', [tripId]);
  }
  if (what.includes('rooms')) {
    await tx.query('UPDATE room_plans SET is_stale = true WHERE trip_id = $1', [tripId]);
  }
  if (what.includes('fits')) {
    await tx.query(
      `UPDATE must_dos SET fit_status = 'unknown', fit_note = NULL, target_day = NULL,
              fit_checked_at = NULL
        WHERE trip_id = $1 AND deleted_at IS NULL`,
      [tripId],
    );
    await queueFitChecks(tx, tripId);
  }
}

export async function moveStep(
  tx: pg.PoolClient,
  trip: SetupTrip,
  to: TripSetupStep,
  actorId: string,
): Promise<void> {
  if (trip.status === 'setup' && trip.setup_step === to) return;
  const entering = trip.status === 'won';
  await tx.query(
    `UPDATE trips SET setup_step = $2, status = CASE WHEN status = 'won' THEN 'setup' ELSE status END
      WHERE id = $1`,
    [trip.id, to],
  );
  if (entering) {
    // Setup opens: every connected calendar of the crew syncs now, not at its next daily run.
    const sources = await tx.query<{ id: string }>(
      `SELECT s.id FROM calendar_sources s
        WHERE s.status = 'active' AND s.kind IN ('oauth_google', 'oauth_microsoft')
          AND s.user_id IN (SELECT app.setup_member_ids($1))`,
      [trip.id],
    );
    for (const source of sources.rows) {
      await sendInTx(
        tx,
        SETUP_QUEUES.calendarSync,
        { source_id: source.id },
        {
          singletonKey: source.id,
        },
      );
    }
    await emitEvent(tx, {
      type: 'trip.status_changed',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'user',
      actorId,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { trip_id: trip.id, from: 'won', to: 'setup' },
    });
  }
  await emitEvent(tx, {
    type: 'setup.step_changed',
    aggregateKind: 'trip',
    aggregateId: trip.id,
    actorKind: 'user',
    actorId,
    crewId: trip.crew_id,
    tripId: trip.id,
    payload: { trip_id: trip.id, from: entering ? null : trip.setup_step, to },
  });
  await publishSetup(tx, trip.id, SETUP_RT.stepStatus, {
    step: to,
    from: entering ? null : trip.setup_step,
  });
  if (to === 'must_dos') await promptMustDos(tx, trip);
}

/**
 * "What's the one thing {place} isn't complete without?": once per member per trip, to every
 * setup member without a must-do yet, when setup reaches must-dos. Runs as the server.
 */
async function promptMustDos(tx: pg.PoolClient, trip: SetupTrip): Promise<void> {
  const { rows } = await tx.query<{ uid: string }>(
    `SELECT m.uid FROM app.setup_member_ids($1) AS m(uid)
      WHERE app.last_setup_event_at('must_do.prompted', $1, m.uid) IS NULL
        AND NOT EXISTS (SELECT 1 FROM must_dos d
                         WHERE d.trip_id = $1 AND d.owner_id = m.uid AND d.deleted_at IS NULL)`,
    [trip.id],
  );
  for (const { uid } of rows) {
    await emitEvent(tx, {
      type: 'must_do.prompted',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'guide',
      actorId: null,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { trip_id: trip.id, user_id: uid },
    });
  }
}

export const lockTripDatesCommand = defineCommand({
  name: 'lock_trip_dates',
  v: 1,
  schema: lockTripDatesPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) => {
    const trip = await asSystemRole(tx, () => loadSetupTrip(tx, payload.trip_id, true));
    requireStatus(trip, SETUP_OPEN_STATUSES);
    const length = daysBetween(payload.start, payload.end) + 1;
    if (length > TRIP_LENGTH_MAX_DAYS) {
      throw new DomainError('VALIDATION', { reason: 'trip_too_long', max: TRIP_LENGTH_MAX_DAYS });
    }
    if (payload.start < todayIn(trip.tz, ctx.clock.serverNow)) {
      throw new DomainError('VALIDATION', { reason: 'dates_in_past' });
    }
    const moved = trip.start_date !== payload.start || trip.end_date !== payload.end;
    return asSystemRole(tx, async () => {
      await tx.query(
        'UPDATE trips SET start_date = $2, end_date = $3, trip_length_days = $4 WHERE id = $1',
        [trip.id, payload.start, payload.end, length],
      );
      if (moved) {
        if (trip.start_date !== null) await markStale(tx, trip.id, ['budget', 'rooms', 'fits']);
        else await queueFitChecks(tx, trip.id);
        await emitEvent(tx, {
          type: 'trip.dates_changed',
          aggregateKind: 'trip',
          aggregateId: trip.id,
          actorKind: 'user',
          actorId: ctx.uid,
          crewId: trip.crew_id,
          tripId: trip.id,
          payload: { trip_id: trip.id },
        });
        // The boost window follows the dates; recomputing notifies every member, which only the
        // server (no acting user) may publish.
        await tx.query("SELECT set_config('app.uid', '', true)");
        await recomputeTrip(tx, trip.id);
        await tx.query("SELECT set_config('app.uid', $1, true)", [ctx.uid]);
        await queueBudgetRecompute(tx, trip.id, true);
      }
      const next: TripSetupStep =
        stepIndex(trip.setup_step) <= stepIndex('when') ? 'budget' : trip.setup_step;
      await moveStep(tx, trip, next, ctx.uid);
      const result = { trip_id: trip.id, start: payload.start, end: payload.end, step: next };
      // The trip's days: a plan she already built follows the dates; a trip with none gets its
      // empty plan.
      const head = await lockTripDraft(tx, trip.id);
      if (head.draftVersionId === null) {
        await ensureDraftDays(tx, head);
        return result;
      }
      if (!moved || head.currentVersionId !== null) return result;
      const movedStops = await reshapeDraftDays(tx, {
        head,
        start: payload.start,
        end: payload.end,
        tz: trip.tz ?? 'UTC',
        actorId: ctx.uid,
      });
      return movedStops.length === 0 ? result : { ...result, moved_stops: movedStops };
    });
  },
});

export const setSetupStepCommand = defineCommand({
  name: 'set_setup_step',
  v: 1,
  schema: setSetupStepPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    requireStatus(await requireOrganiser(tx, payload.trip_id), SETUP_OPEN_STATUSES);
  },
  handle: async (tx, payload, ctx) =>
    asSystemRole(tx, async () => {
      const trip = await loadSetupTrip(tx, payload.trip_id, true);
      requireStatus(trip, SETUP_OPEN_STATUSES);
      if (trip.status === 'won') {
        if (payload.step !== 'when') {
          throw new DomainError('STATE_INVALID', { reason: 'setup_not_started' });
        }
        await moveStep(tx, trip, 'when', ctx.uid);
        return { trip_id: trip.id, step: 'when' as const };
      }
      const counts = await tx.query<{ rooms: number; must_dos: number; stays: number }>(
        `SELECT coalesce((SELECT jsonb_array_length(rooms) FROM room_plans WHERE trip_id = $1), 0)::int AS rooms,
                (SELECT count(*) FROM must_dos WHERE trip_id = $1 AND deleted_at IS NULL)::int AS must_dos,
                (SELECT count(*) FROM destination_cost_indices c JOIN trips t ON t.destination_id = c.destination_id
                  WHERE t.id = $1 AND c.reviewed_at IS NOT NULL)::int AS stays`,
        [trip.id],
      );
      const to = resolveSetupStep(
        {
          current: trip.setup_step,
          crewSize: (await setupMemberIds(tx, trip.id)).length,
          isSolo: trip.is_solo,
          datesLocked: trip.start_date !== null,
          roomCount: counts.rows[0]?.rooms ?? 0,
          stayCount: counts.rows[0]?.stays ?? 0,
          mustDoCount: counts.rows[0]?.must_dos ?? 0,
          withoutMustDos: payload.without_must_dos === true,
        },
        payload.step,
      );
      if (stepIndex(to) < stepIndex(trip.setup_step)) {
        await markStale(tx, trip.id, staleAfterReopen(to));
      }
      await moveStep(tx, trip, to, ctx.uid);
      return { trip_id: trip.id, step: to };
    }),
});
