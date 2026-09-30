/**
 * `rebind_crew_year {grant_id, crew_id}`: the crew yearly's buyer moves it to another crew they
 * are in, at most once per paid period. Both crews' trips are recomputed at once.
 */
import { emitEvent } from '@cp/db';
import { DomainError, rebindCrewYearPayloadSchema } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { recomputeCrewTrips } from '../../billing/crew-year';
import { defineCommand } from '../_framework/define-command';

interface GrantRow {
  readonly id: string;
  readonly crew_id: string;
  readonly buyer_id: string;
  readonly valid_to: Date;
  readonly rebound_for_period_end: Date | null;
  readonly revoked_at: Date | null;
}

export const rebindCrewYearCommand = defineCommand({
  name: 'rebind_crew_year',
  v: 1,
  schema: rebindCrewYearPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_crew_member($1) AS member',
      [payload.crew_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_in_crew' });
    const grant = await tx.query<{ buyer_id: string }>(
      'SELECT buyer_id FROM crew_year_grants WHERE id = $1',
      [payload.grant_id],
    );
    if (grant.rows[0] === undefined) throw new DomainError('NOT_FOUND', { reason: 'grant' });
    if (grant.rows[0].buyer_id !== ctx.uid)
      throw new DomainError('FORBIDDEN', { reason: 'not_buyer' });
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const now = ctx.clock.serverNow;
      const { rows } = await tx.query<GrantRow>(
        `SELECT id, crew_id, buyer_id, valid_to, rebound_for_period_end, revoked_at
           FROM crew_year_grants WHERE id = $1 FOR UPDATE`,
        [payload.grant_id],
      );
      const grant = rows[0];
      if (grant === undefined) throw new DomainError('NOT_FOUND', { reason: 'grant' });
      if (grant.revoked_at !== null || grant.valid_to <= now) {
        throw new DomainError('STATE_INVALID', { reason: 'grant_ended' });
      }
      if (grant.crew_id === payload.crew_id) return { grant_id: grant.id, crew_id: grant.crew_id };
      if (grant.rebound_for_period_end?.getTime() === grant.valid_to.getTime()) {
        throw new DomainError('STATE_INVALID', { reason: 'rebind_used' });
      }
      await tx.query(
        'UPDATE crew_year_grants SET crew_id = $2, rebound_for_period_end = valid_to WHERE id = $1',
        [grant.id, payload.crew_id],
      );
      await recomputeCrewTrips(tx, grant.crew_id, now);
      await recomputeCrewTrips(tx, payload.crew_id, now);
      await emitEvent(tx, {
        type: 'crew_year.rebound',
        aggregateKind: 'crew_year_grant',
        aggregateId: grant.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: payload.crew_id,
        payload: {
          grant_id: grant.id,
          buyer_id: ctx.uid,
          from_crew_id: grant.crew_id,
          to_crew_id: payload.crew_id,
        },
      });
      return { grant_id: grant.id, crew_id: payload.crew_id };
    }),
});
