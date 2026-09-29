/**
 * `request_redraft` (docs/api-contracts.md §4.6): an organiser asks for one day of their private
 * draft again, with reason chips or a note, against the draft version they are looking at (a stale
 * one gets `VERSION_CONFLICT` with the current version). The trip's redraft quota is reserved in
 * the same transaction (`REDRAFT_LIMIT` when it is spent; the silent fair-use cap on unlimited
 * trips), a free fit-in redraft for a must-do added after the draft reserves nothing, and the job,
 * its reservation and the crew's counter all commit together. One redraft at a time per trip.
 */
import { startAgentJob } from '@cp/ai';
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  DRAFT_QUEUES,
  REDRAFT_STEP_IDS,
  requestRedraftPayloadSchema,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { entitle } from '../../entitlements/entitle';
import { defineCommand } from '../_framework/define-command';
import { loadSetupTrip, publishRedraftCounter, requireOrganiser, requireStatus } from './shared';

/** A must-do added after the draft was made that the draft does not place yet. */
async function lateMustDo(tx: pg.PoolClient, tripId: string, versionId: string): Promise<boolean> {
  const { rows } = await tx.query<{ late: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM must_dos m, itinerary_versions v
        WHERE v.id = $2 AND m.trip_id = $1 AND m.deleted_at IS NULL AND m.created_at > v.created_at
          AND NOT EXISTS (SELECT 1 FROM plan_items i WHERE i.version_id = v.id AND i.must_do_id = m.id)
     ) AS late`,
    [tripId, versionId],
  );
  return rows[0]?.late === true;
}

export const requestRedraftCommand = defineCommand({
  name: 'request_redraft',
  v: 1,
  schema: requestRedraftPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireOrganiser(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    const trip = await asSystemRole(tx, () => loadSetupTrip(tx, payload.trip_id, true));
    if (trip.status === 'redrafting') {
      throw new DomainError('STATE_INVALID', { reason: 'redraft_open', state: trip.status });
    }
    requireStatus(trip, ['draft_review']);
    const { rows } = await tx.query<{ draft_version_id: string | null }>(
      'SELECT draft_version_id FROM trips WHERE id = $1',
      [trip.id],
    );
    const current = rows[0]?.draft_version_id ?? null;
    if (current === null || current !== payload.base_version) {
      throw new DomainError('VERSION_CONFLICT', { current_version: current });
    }
    const day = await tx.query('SELECT 1 FROM plan_days WHERE version_id = $1 AND day_no = $2', [
      current,
      payload.day,
    ]);
    if (day.rowCount === 0) throw new DomainError('VALIDATION', { reason: 'no_such_day' });
    const free = payload.free_reason === 'late_must_do';
    if (free && !(await asSystemRole(tx, () => lateMustDo(tx, trip.id, current)))) {
      throw new DomainError('VALIDATION', { reason: 'not_free' });
    }
    const reservation = free
      ? undefined
      : await entitle(
          tx,
          { uid: ctx.uid, deviceTz: ctx.device.tz },
          { kind: 'redraft', tripId: trip.id },
        );
    return asSystemRole(tx, async () => {
      const { rows: seq } = await tx.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM agent_jobs WHERE trip_id = $1 AND kind = 'redraft'",
        [trip.id],
      );
      const job = await startAgentJob(
        tx,
        (queue, data, options) => sendInTx(tx, queue, data, options),
        {
          kind: 'redraft',
          queue: DRAFT_QUEUES.redraft,
          userId: ctx.uid,
          tripId: trip.id,
          baseVersionId: current,
          input: {
            trip_id: trip.id,
            day: payload.day,
            reasons: payload.reasons,
            note: payload.note ?? null,
            base_version: current,
            seq: (seq[0]?.n ?? 0) + 1,
          },
          stepIds: REDRAFT_STEP_IDS,
        },
      );
      await tx.query(
        `INSERT INTO redraft_reservations (trip_id, agent_job_id, free_reason, quota_period_key)
         VALUES ($1, $2, $3, $4)`,
        [trip.id, job.id, free ? 'late_must_do' : null, reservation?.periodKey ?? null],
      );
      await tx.query("UPDATE trips SET status = 'redrafting' WHERE id = $1", [trip.id]);
      await emitEvent(tx, {
        type: 'redraft.requested',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: {
          trip_id: trip.id,
          redraft_id: job.id,
          day_no: payload.day,
          reasons: payload.reasons,
          free,
        },
      });
      await publishRedraftCounter(tx, trip.id);
      return { trip_id: trip.id, redraft_id: job.id, job_id: job.id };
    });
  },
});
