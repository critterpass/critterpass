/**
 * `resolve_sos {sos_id, note?, false_alarm?}` (3k-10 I'M OK / "He's safe"): the sender or a
 * responder closes the incident. Every SOS share of it ends (the sender's and the responders'),
 * the crew hears the all-clear (N-48, ALWAYS) and `sos:{id}` says `resolved`. A stale SOS (never
 * alerted) resolves quietly as the sender's false alarm. Resolving twice answers the first result.
 */
import { DomainError, resolveSosPayloadSchema, type ResolveSosResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { asSystem, emit, publishSos, requireVisibleSos } from './shared';

export const resolveSosCommand = defineCommand({
  name: 'resolve_sos',
  v: 1,
  schema: resolveSosPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    if (sos.user_id !== ctx.uid && !sos.responder_ids.includes(ctx.uid)) {
      throw new DomainError('FORBIDDEN', { reason: 'not_sender_or_responder' });
    }
  },
  handle: async (tx, payload, ctx): Promise<ResolveSosResult> => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    const alerted = sos.status !== 'stale';
    if (sos.status === 'resolved') return { sos_id: sos.id, status: 'resolved', alerted: true };
    const falseAlarm = !alerted || payload.false_alarm === true;
    await asSystem(
      tx,
      `UPDATE help_sessions SET status = 'resolved', resolved_at = now(), resolved_by = $2,
              false_alarm = $3
        WHERE id = $1`,
      [sos.id, ctx.uid, falseAlarm],
    );
    await asSystem(
      tx,
      `UPDATE location_shares SET ends_at = greatest(now(), starts_at + interval '1 millisecond')
        WHERE ends_at IS NULL AND reason = 'sos'
          AND (id = $1 OR id IN (
            SELECT (value ->> 'share_id')::uuid FROM help_sessions s, jsonb_each(s.responses)
             WHERE s.id = $1 AND value ? 'share_id'))`,
      [sos.id],
    );
    if (alerted) {
      await publishSos(tx, sos.id, 'resolved', {
        by: ctx.uid,
        false_alarm: falseAlarm,
        note: payload.note ?? null,
        at: ctx.clock.serverNow.toISOString(),
      });
    }
    await emit(tx, {
      type: 'sos.resolved',
      aggregateKind: 'help_session',
      aggregateId: sos.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: sos.crew_id,
      tripId: sos.trip_id,
      payload: {
        trip_id: sos.trip_id,
        sos_id: sos.id,
        by: ctx.uid,
        false_alarm: falseAlarm,
        alerted,
      },
    });
    return { sos_id: sos.id, status: 'resolved', alerted };
  },
});
