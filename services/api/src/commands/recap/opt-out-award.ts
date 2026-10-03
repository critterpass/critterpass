/**
 * `opt_out_award {award_id, opted_out}` (doc delta, offline): a traveller hides their own award
 * from everyone's recap (or brings it back). Only the award's owner may; the row syncs to the crew
 * with the flag, and the app draws nothing for a hidden award.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, optOutAwardPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function ownAward(
  tx: pg.PoolClient,
  awardId: string,
  uid: string,
): Promise<{ recap_id: string; trip_id: string }> {
  const { rows } = await tx.query<{ recap_id: string; trip_id: string; user_id: string }>(
    'SELECT recap_id, trip_id, user_id FROM recap_awards WHERE id = $1',
    [awardId],
  );
  const award = rows[0];
  if (award === undefined) throw new DomainError('NOT_FOUND', { reason: 'award' });
  if (award.user_id !== uid) throw new DomainError('FORBIDDEN', { reason: 'not_your_award' });
  return award;
}

export const optOutAwardCommand = defineCommand({
  name: 'opt_out_award',
  v: 1,
  schema: optOutAwardPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await ownAward(tx, payload.award_id, ctx.uid);
  },
  handle: async (tx, payload, ctx) => {
    const award = await ownAward(tx, payload.award_id, ctx.uid);
    return asSystemRole(tx, async () => {
      const { rowCount } = await tx.query(
        'UPDATE recap_awards SET opted_out = $2 WHERE id = $1 AND opted_out <> $2',
        [payload.award_id, payload.opted_out],
      );
      if ((rowCount ?? 0) > 0) {
        await appendDomainEvent(tx, {
          type: 'recap.award_opted_out',
          aggregateKind: 'recap',
          aggregateId: award.recap_id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: award.trip_id,
          payload: {
            trip_id: award.trip_id,
            recap_id: award.recap_id,
            award_id: payload.award_id,
            opted_out: payload.opted_out,
          },
        });
      }
      return { award_id: payload.award_id, opted_out: payload.opted_out };
    });
  },
});
