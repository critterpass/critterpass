/**
 * `tell_crew_boost` (TELL THE CREW on the boost's stamp): the buyer posts the boost's card to the
 * crew chat, once. The card is a `boost_card` message pointing at the boost; the app draws it from
 * the synced boost, its split and the crew's payments. Asking again answers with the same message.
 */
import { outbox } from '@cp/db';
import { channelName, DomainError, tellCrewBoostPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

interface BoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string | null;
  readonly status: string;
}

async function loadBoost(tx: pg.PoolClient, id: string, lock: boolean): Promise<BoostRow> {
  const { rows } = await tx.query<BoostRow>(
    `SELECT id, trip_id, crew_id, buyer_id, status FROM trip_boosts WHERE id = $1${
      lock ? ' FOR UPDATE' : ''
    }`,
    [id],
  );
  const boost = rows[0];
  if (boost === undefined) throw new DomainError('NOT_FOUND', { reason: 'boost' });
  return boost;
}

export const tellCrewBoostCommand = defineCommand({
  name: 'tell_crew_boost',
  v: 1,
  schema: tellCrewBoostPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const boost = await loadBoost(tx, payload.boost_id, false);
    if (boost.buyer_id !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_buyer' });
    if (boost.status !== 'scheduled' && boost.status !== 'active') {
      throw new DomainError('STATE_INVALID', { reason: 'boost_not_live' });
    }
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      // The boost row is the lock: two taps (or a retry) post one card.
      const boost = await loadBoost(tx, payload.boost_id, true);
      const { rows: posted } = await tx.query<{ id: string }>(
        `SELECT id FROM messages
          WHERE crew_id = $1 AND type = 'boost_card' AND ref_kind = 'trip_boost' AND ref_id = $2
          ORDER BY seq LIMIT 1`,
        [boost.crew_id, boost.id],
      );
      if (posted[0] !== undefined) return { message_id: posted[0].id, posted: false };
      const { rows } = await tx.query<{ id: string; seq: string }>(
        `INSERT INTO messages (crew_id, trip_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
         VALUES ($1, $2, 'user', $3, 'boost_card', '', 'trip_boost', $4) RETURNING id, seq`,
        [boost.crew_id, boost.trip_id, ctx.uid, boost.id],
      );
      const message = rows[0];
      if (message === undefined) throw new Error('boost card insert returned no row');
      await outbox(tx, channelName('crew_chat', boost.crew_id), 'message.created', {
        crew_id: boost.crew_id,
        message_id: message.id,
        seq: Number(message.seq),
      });
      return { message_id: message.id, posted: true };
    }),
});
