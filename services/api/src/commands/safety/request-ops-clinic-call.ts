/**
 * `request_ops_clinic_call {trip_id, session_id?, facility_id?, share_insurance, text_shown}` (3k-6
 * "Ops desk can call the clinic with you", 3k-10 steps): the sender hands the clinic call to a
 * person at the ops desk — never an automated call. It records the exact text the sender approved,
 * opens one clinic desk task linked to the Help session or SOS (a new Help session when none is
 * named), and shows "Ops desk is calling the clinic with you" as pending. Insurance details reach
 * the desk only when the sender said yes here, their consent stands and a policy is on file
 * (`app.share_insurance`); the step says so either way.
 */
import { appendDomainEvent } from '@cp/db';
import {
  CONCIERGE_SLA_MIN,
  deskDueAt,
  DomainError,
  generateUuidV7,
  requestOpsClinicCallPayloadSchema,
  type RequestOpsClinicCallResult,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { deskHours } from '../../suppliers/vendor-store';
import { defineCommand } from '../_framework/define-command';
import { asSystem, emit, firstRow, requireTripParticipant, setStep, tripCrew } from './shared';

export const requestOpsClinicCallCommand = defineCommand({
  name: 'request_ops_clinic_call',
  v: 1,
  schema: requestOpsClinicCallPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => requireTripParticipant(tx, payload.trip_id, ctx.uid),
  handle: async (tx, payload, ctx): Promise<RequestOpsClinicCallResult> => {
    const now = ctx.clock.serverNow;
    let sessionId = payload.session_id;
    if (sessionId === undefined) {
      const opened = await tx.query<{ id: string }>(
        `INSERT INTO help_sessions (trip_id, user_id, kind, opened_at)
         VALUES ($1, $2, 'help', $3) RETURNING id`,
        [payload.trip_id, ctx.uid, now],
      );
      sessionId = firstRow(opened.rows, 'session insert').id;
    } else {
      const own = await tx.query(
        `SELECT 1 FROM help_sessions
          WHERE id = $1 AND user_id = $2 AND trip_id = $3 AND status <> 'resolved'`,
        [sessionId, ctx.uid, payload.trip_id],
      );
      if ((own.rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'session' });
    }
    // app_user may insert its own approval but never read one back, so the id is chosen here.
    const approvalId = generateUuidV7();
    await tx.query(
      `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown, op_id)
       VALUES ($1, $2, 'clinic_handoff', $3, $4, $5)`,
      [approvalId, ctx.uid, sessionId, payload.text_shown, ctx.opId],
    );

    let insuranceShared = false;
    if (payload.share_insurance) {
      await asSystem(
        tx,
        `INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'insurance_to_clinic', now())
         ON CONFLICT (user_id, purpose) DO UPDATE SET granted_at = now(), revoked_at = NULL`,
        [ctx.uid],
      );
      const shared = await tx.query('SELECT approval_id FROM app.share_insurance($1, $2)', [
        sessionId,
        payload.text_shown,
      ]);
      insuranceShared = (shared.rowCount ?? 0) > 0;
    }

    const crewId = await tripCrew(tx, payload.trip_id);
    const taskId = await asSystemRole(tx, async () => {
      const hours = await deskHours(tx);
      const dueAt = deskDueAt(now, hours, CONCIERGE_SLA_MIN.clinic);
      const note = {
        at: now.toISOString(),
        admin_id: null,
        user_id: ctx.uid,
        help_session_id: sessionId,
        facility_id: payload.facility_id ?? null,
        share_insurance: payload.share_insurance,
        text: payload.text_shown,
      };
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO ops.concierge_tasks (kind, trip_id, requested_by, approval_id, due_at, notes)
         VALUES ('clinic_handoff', $1, $2, $3, $4, jsonb_build_array($5::jsonb)) RETURNING id`,
        [payload.trip_id, ctx.uid, approvalId, dueAt, JSON.stringify(note)],
      );
      return firstRow(rows, 'desk task insert').id;
    });
    await asSystem(tx, 'UPDATE help_sessions SET clinic_requested_at = $2 WHERE id = $1', [
      sessionId,
      now,
    ]);
    await setStep(tx, sessionId, 'ops_clinic', { state: 'pending' }, now);
    if (payload.share_insurance) {
      await setStep(tx, sessionId, 'insurance', { state: 'pending' }, now);
    }
    await appendDomainEvent(tx, {
      type: 'concierge.requested',
      aggregateKind: 'concierge_task',
      aggregateId: taskId,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId,
      tripId: payload.trip_id,
      payload: { trip_id: payload.trip_id, task_id: taskId, kind: 'clinic' },
    });
    await emit(tx, {
      type: 'help.clinic_requested',
      aggregateKind: 'help_session',
      aggregateId: sessionId,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId,
      tripId: payload.trip_id,
      payload: {
        trip_id: payload.trip_id,
        session_id: sessionId,
        task_id: taskId,
        details_consent: insuranceShared,
      },
    });
    return { session_id: sessionId, task_id: taskId, insurance_shared: insuranceShared };
  },
});
