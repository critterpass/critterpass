/**
 * `request_concierge {task_id, trip_id, kind: clinic|vendor|other, text}` (3k-10 "Ops desk is
 * calling the clinic with you"): a trip participant hands something to the human ops desk. One desk
 * task per request id (a replay answers the same task), due within the kind's pick-up window from
 * now, or from the desk's next opening when it is closed ("The desk answers from 07:00 SGT"). The
 * traveller's words are the task's first note. For a clinic the answer says whether insurance is on
 * file and already consented to, so the app can offer to share it through `share_insurance`; nothing
 * is shared here.
 */
import { appendDomainEvent } from '@cp/db';
import {
  CONCIERGE_SLA_MIN,
  CONCIERGE_TASK_KIND_OF,
  deskDueAt,
  DomainError,
  isDeskOpen,
  requestConciergePayloadSchema,
  type ConciergeRequestKind,
  type RequestConciergeResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { deskHours } from '../../suppliers/vendor-store';
import { requireTripParticipant } from '../bookings/shared';
import { defineCommand } from '../_framework/define-command';

const KIND_OF_TASK: Readonly<Record<string, ConciergeRequestKind>> = {
  clinic_handoff: 'clinic',
  vendor_message: 'vendor',
  other: 'other',
};

async function insurance(
  tx: pg.PoolClient,
  uid: string,
): Promise<RequestConciergeResult['insurance']> {
  const { rows } = await tx.query<{ on_file: boolean; consented: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM insurance_policies WHERE user_id = $1 AND deleted_at IS NULL)
              AS on_file,
            EXISTS (SELECT 1 FROM consents WHERE user_id = $1 AND purpose = 'insurance_to_clinic'
                      AND granted_at IS NOT NULL AND revoked_at IS NULL) AS consented`,
    [uid],
  );
  return { on_file: rows[0]?.on_file === true, consented: rows[0]?.consented === true };
}

export const requestConciergeCommand = defineCommand({
  name: 'request_concierge',
  v: 1,
  schema: requestConciergePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireTripParticipant(tx, payload.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<RequestConciergeResult> => {
    const trip = await requireTripParticipant(tx, payload.trip_id, ctx.uid);
    const now = ctx.clock.serverNow;
    return asSystemRole(tx, async () => {
      const hours = await deskHours(tx);
      const known = await tx.query<{
        kind: string;
        trip_id: string | null;
        requested_by: string | null;
        due_at: Date | null;
      }>('SELECT kind, trip_id, requested_by, due_at FROM ops.concierge_tasks WHERE id = $1', [
        payload.task_id,
      ]);
      const replay = known.rows[0];
      if (replay !== undefined) {
        if (replay.requested_by !== ctx.uid || replay.trip_id !== trip.id) {
          throw new DomainError('VALIDATION', { reason: 'task_id' });
        }
        const kind = KIND_OF_TASK[replay.kind] ?? 'other';
        return {
          task_id: payload.task_id,
          kind,
          due_at: (replay.due_at ?? now).toISOString(),
          desk_open: isDeskOpen(now, hours),
          desk_hours: hours,
          insurance: kind === 'clinic' ? await insurance(tx, ctx.uid) : null,
        };
      }
      const dueAt = deskDueAt(now, hours, CONCIERGE_SLA_MIN[payload.kind]);
      await tx.query(
        `INSERT INTO ops.concierge_tasks (id, kind, trip_id, requested_by, due_at, notes)
         VALUES ($1, $2, $3, $4, $5, jsonb_build_array(jsonb_build_object('at', $6::text,
           'admin_id', NULL, 'user_id', $8::text, 'text', $7::text)))`,
        [
          payload.task_id,
          CONCIERGE_TASK_KIND_OF[payload.kind],
          trip.id,
          ctx.uid,
          dueAt,
          now.toISOString(),
          payload.text,
          ctx.uid,
        ],
      );
      await appendDomainEvent(tx, {
        type: 'concierge.requested',
        aggregateKind: 'concierge_task',
        aggregateId: payload.task_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, task_id: payload.task_id, kind: payload.kind },
      });
      return {
        task_id: payload.task_id,
        kind: payload.kind,
        due_at: dueAt.toISOString(),
        desk_open: isDeskOpen(now, hours),
        desk_hours: hours,
        insurance: payload.kind === 'clinic' ? await insurance(tx, ctx.uid) : null,
      };
    });
  },
});
