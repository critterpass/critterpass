/**
 * `respond_sos {sos_id, state: seen | coming | calling}` (3k-10 I'M GOING, N-24 COMING action): a
 * crewmate answers an open SOS. Seen and calling are recorded for the sender's "{n} seen" and
 * never downgrade someone already coming. I'M GOING makes them a responder (they read the health
 * notes), opens their own SOS location share so the sender sees them come and the walking ETA can be
 * counted, and starts the ETA recount. The sender cannot respond to their own SOS.
 */
import { sendInTx } from '@cp/db';
import {
  DomainError,
  respondSosPayloadSchema,
  SAFETY_QUEUES,
  type RespondSosPayload,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import {
  asSystem,
  emit,
  firstRow,
  publishSos,
  requireTripParticipant,
  requireVisibleSos,
} from './shared';

export interface RespondSosResult {
  readonly sos_id: string;
  readonly state: RespondSosPayload['state'];
  /** The responder's own share for their fixes, when coming. */
  readonly share_id: string | null;
}

export const respondSosCommand = defineCommand({
  name: 'respond_sos',
  v: 1,
  schema: respondSosPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'sos',
  authorize: async (tx, payload, ctx) => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    await requireTripParticipant(tx, sos.trip_id, ctx.uid);
    if (sos.user_id === ctx.uid) throw new DomainError('STATE_INVALID', { reason: 'own_sos' });
  },
  handle: async (tx, payload, ctx): Promise<RespondSosResult> => {
    const sos = await requireVisibleSos(tx, payload.sos_id);
    if (sos.status !== 'open' && sos.status !== 'responding') {
      throw new DomainError('STATE_INVALID', { reason: 'sos_closed' });
    }
    const now = ctx.clock.serverNow;
    const previous = await asSystem<{ state: string | null; share_id: string | null }>(
      tx,
      `SELECT responses -> $2::text ->> 'state' AS state,
              responses -> $2::text ->> 'share_id' AS share_id
         FROM help_sessions WHERE id = $1`,
      [sos.id, ctx.uid],
    );
    const before = previous.rows[0];
    const coming = payload.state === 'coming' || before?.state === 'coming';
    const state = coming ? 'coming' : payload.state;
    let shareId = before?.share_id ?? null;
    if (payload.state === 'coming' && shareId === null) {
      const share = await tx.query<{ id: string }>(
        `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at)
         VALUES ($1, $2, 'sos', $3, NULL) RETURNING id`,
        [sos.trip_id, ctx.uid, now],
      );
      shareId = firstRow(share.rows, 'responder share').id;
    }
    const response = {
      state,
      at: now.toISOString(),
      ...(shareId === null ? {} : { share_id: shareId }),
    };
    await asSystem(
      tx,
      `UPDATE help_sessions
          SET responses = responses || jsonb_build_object($2::text,
                coalesce(responses -> $2::text, '{}'::jsonb) || $3::jsonb),
              responder_ids = CASE WHEN $4 AND NOT ($2::uuid = ANY (responder_ids))
                                   THEN responder_ids || $2::uuid ELSE responder_ids END,
              status = CASE WHEN $4 THEN 'responding' ELSE status END
        WHERE id = $1`,
      [sos.id, ctx.uid, JSON.stringify(response), coming],
    );
    await publishSos(tx, sos.id, 'responder', { uid: ctx.uid, ...response });
    if (payload.state !== before?.state) {
      await emit(tx, {
        type: 'sos.responded',
        aggregateKind: 'help_session',
        aggregateId: sos.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: sos.crew_id,
        tripId: sos.trip_id,
        payload: { trip_id: sos.trip_id, sos_id: sos.id, user_id: ctx.uid, state: payload.state },
      });
    }
    if (payload.state === 'coming') {
      await sendInTx(
        tx,
        SAFETY_QUEUES.sosResponderEta,
        { sos_id: sos.id },
        { singletonKey: `${sos.id}:now` },
      );
    }
    return { sos_id: sos.id, state, share_id: shareId };
  },
});
