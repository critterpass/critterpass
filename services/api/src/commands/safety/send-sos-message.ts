/**
 * `send_sos_message {sos_id, message_id?, body}` (3k-10 thread): the sender or a crewmate on the
 * trip writes into an open SOS. The message syncs on the trip stream and is hinted on `sos:{id}`
 * at once; a replayed id lands on the same row.
 */
import { DomainError, generateUuidV7, sendSosMessagePayloadSchema } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { emit, publishSos, requireTripParticipant, requireVisibleSos } from './shared';

export const sendSosMessageCommand = defineCommand({
  name: 'send_sos_message',
  v: 1,
  schema: sendSosMessagePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    await requireTripParticipant(tx, sos.trip_id, ctx.uid);
  },
  handle: async (tx, payload, ctx): Promise<{ message_id: string }> => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    if (sos.status !== 'open' && sos.status !== 'responding') {
      throw new DomainError('STATE_INVALID', { reason: 'sos_closed' });
    }
    const messageId = payload.message_id ?? generateUuidV7();
    const at = ctx.clock.serverNow;
    const inserted = await tx.query(
      `INSERT INTO help_session_messages (id, help_session_id, trip_id, sender_id, body, at)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [messageId, sos.id, sos.trip_id, ctx.uid, payload.body, at],
    );
    if ((inserted.rowCount ?? 0) === 0) return { message_id: messageId };
    await publishSos(tx, sos.id, 'message', {
      id: messageId,
      sender_id: ctx.uid,
      body: payload.body,
      at: at.toISOString(),
    });
    await emit(tx, {
      type: 'sos.message',
      aggregateKind: 'help_session',
      aggregateId: sos.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: sos.crew_id,
      tripId: sos.trip_id,
      payload: { trip_id: sos.trip_id, sos_id: sos.id, message_id: messageId, sender_id: ctx.uid },
    });
    return { message_id: messageId };
  },
});
