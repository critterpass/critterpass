/**
 * `thank_boost` (THANKS {BUYER} on the crew's boost card): a crewmate thanks the buyer once. The
 * card flips to "SENT ♥" from the synced `thanked_by`; the buyer is told through `boost.thanked`.
 */
import { emitEvent } from '@cp/db';
import { DomainError, thankBoostPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asServer } from '../../billing/as-server';
import { publishBoostState } from '../../billing/boost-rt';
import { defineCommand } from '../_framework/define-command';

interface BoostRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly buyer_id: string | null;
  readonly status: 'scheduled' | 'active' | 'ended' | 'moved' | 'revoked' | 'credit';
  readonly thanked_by: string[];
}

async function loadBoost(tx: pg.PoolClient, id: string): Promise<BoostRow> {
  const { rows } = await tx.query<BoostRow>(
    'SELECT id, trip_id, crew_id, buyer_id, status, thanked_by FROM trip_boosts WHERE id = $1',
    [id],
  );
  const boost = rows[0];
  if (boost === undefined) throw new DomainError('NOT_FOUND', { reason: 'boost' });
  return boost;
}

export const thankBoostCommand = defineCommand({
  name: 'thank_boost',
  v: 1,
  schema: thankBoostPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const boost = await loadBoost(tx, payload.boost_id);
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_crew_member($1) AS member',
      [boost.crew_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_crew' });
    if (boost.buyer_id === null || boost.buyer_id === ctx.uid) {
      throw new DomainError('FORBIDDEN', { reason: 'nobody_to_thank' });
    }
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const { rows } = await tx.query<BoostRow>(
        `UPDATE trip_boosts SET thanked_by = array_append(thanked_by, $2::uuid)
          WHERE id = $1 AND NOT ($2::uuid = ANY (thanked_by))
          RETURNING id, trip_id, crew_id, buyer_id, status, thanked_by`,
        [payload.boost_id, ctx.uid],
      );
      const boost = rows[0];
      if (boost === undefined)
        throw new DomainError('STATE_INVALID', { reason: 'already_thanked' });
      await publishBoostState(
        tx,
        { id: boost.id, tripId: boost.trip_id, crewId: boost.crew_id },
        boost.status,
      );
      await emitEvent(tx, {
        type: 'boost.thanked',
        aggregateKind: 'trip_boost',
        aggregateId: boost.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: boost.crew_id,
        tripId: boost.trip_id,
        payload: {
          trip_id: boost.trip_id,
          crew_id: boost.crew_id,
          boost_id: boost.id,
          buyer_id: boost.buyer_id,
          by_uid: ctx.uid,
        },
      });
      return { boost_id: boost.id, thanked: true };
    }),
});
