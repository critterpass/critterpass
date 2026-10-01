/**
 * `sos.escalate`: two minutes after the fan-out, an SOS nobody said they are coming to is pushed to
 * the crew again (`sos.escalated`, ALWAYS, collapsing onto the first push) and the sender's app is
 * told on `user:#uid` and `sos:{id}`, so it can ask "No one's answered — call {general}?" (a
 * question with a plain dialer link; nothing is dialled for them). Once per incident.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import { SAFETY_QUEUES, sosChannel, sosJobSchema, userChannel } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export function escalateSos(
  pool: pg.Pool,
  sosId: string,
  now: Date = new Date(),
): Promise<{ readonly escalated: boolean }> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ trip_id: string; crew_id: string; user_id: string }>(
      `SELECT s.trip_id, t.crew_id, s.user_id FROM help_sessions s JOIN trips t ON t.id = s.trip_id
        WHERE s.id = $1 AND s.kind = 'sos' AND s.status = 'open' AND s.escalated_at IS NULL
        FOR UPDATE OF s`,
      [sosId],
    );
    const sos = rows[0];
    if (sos === undefined) return { escalated: false };
    await tx.query('UPDATE help_sessions SET escalated_at = $2 WHERE id = $1', [sosId, now]);
    const hint = { sos_id: sosId, at: now.toISOString() };
    await outbox(tx, sosChannel(sosId), 'escalated', hint);
    await outbox(tx, userChannel(sos.user_id), 'sos.escalated', hint);
    await appendDomainEvent(tx, {
      type: 'sos.escalated',
      aggregateKind: 'help_session',
      aggregateId: sosId,
      actorKind: 'system',
      actorId: null,
      crewId: sos.crew_id,
      tripId: sos.trip_id,
      payload: { trip_id: sos.trip_id, sos_id: sosId },
    });
    return { escalated: true };
  });
}

export function sosEscalateJob(): AnyJobDefinition {
  return defineJob({
    queue: SAFETY_QUEUES.sosEscalate,
    schema: sosJobSchema,
    async handler(data, { pool }) {
      return { ...(await escalateSos(pool, data.sos_id)) };
    },
  });
}
