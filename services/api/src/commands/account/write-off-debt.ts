/**
 * `write_off_debt` (docs/api-contracts.md §4.9, payee path): the person owed forgives some or all
 * of what one crewmate (or a former member) owes them in one crew and currency. The ledger gets an
 * `adjustment` entry in the other direction, so every balance still sums to zero. The system path
 * (amounts owed to a purged account) runs in the purge job with the same entry shape.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError, generateUuidV7, writeOffDebtPayloadSchema } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

/** What `fromUid` still owes `toUid` in this crew and currency (optionally one trip). */
export async function pairOwed(
  tx: pg.PoolClient,
  input: {
    crewId: string;
    tripId: string | null;
    fromUid: string;
    toUid: string;
    currency: string;
  },
): Promise<number> {
  const { rows } = await tx.query<{ owed: string }>(
    `SELECT coalesce(sum(CASE WHEN debtor_id = $2 THEN amount_minor ELSE -amount_minor END), 0)::text
            AS owed
       FROM ledger_entries
      WHERE crew_id = $1 AND currency = $4 AND ($5::uuid IS NULL OR trip_id = $5)
        AND ((debtor_id = $2 AND creditor_id = $3) OR (debtor_id = $3 AND creditor_id = $2))`,
    [input.crewId, input.fromUid, input.toUid, input.currency, input.tripId],
  );
  return Number(rows[0]?.owed ?? 0);
}

export const writeOffDebtCommand = defineCommand({
  name: 'write_off_debt',
  v: 1,
  schema: writeOffDebtPayloadSchema,
  offline: false,
  authorize: async (_tx, payload, ctx) => {
    if (payload.to_uid !== ctx.uid) throw new DomainError('FORBIDDEN', { reason: 'not_payee' });
    if (payload.from_uid === payload.to_uid) {
      throw new DomainError('VALIDATION', { reason: 'same_person' });
    }
    return Promise.resolve();
  },
  handle: async (tx, payload, ctx): Promise<{ written_off_minor: number }> =>
    asSystemRole(tx, async () => {
      const member = await tx.query(
        'SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2',
        [payload.crew_id, ctx.uid],
      );
      if (member.rowCount === 0) throw new DomainError('NOT_FOUND');
      const owed = await pairOwed(tx, {
        crewId: payload.crew_id,
        tripId: payload.trip_id,
        fromUid: payload.from_uid,
        toUid: payload.to_uid,
        currency: payload.currency,
      });
      if (payload.amount_minor > owed) {
        throw new DomainError('STATE_INVALID', { reason: 'more_than_owed', owed_minor: owed });
      }
      await tx.query(
        `INSERT INTO ledger_entries
           (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency, source_kind, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, 'adjustment', $7)`,
        [
          payload.crew_id,
          payload.trip_id,
          payload.to_uid,
          payload.from_uid,
          payload.amount_minor,
          payload.currency,
          generateUuidV7(),
        ],
      );
      await appendDomainEvent(tx, {
        type: 'ledger.written_off',
        aggregateKind: 'crew',
        aggregateId: payload.crew_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: payload.crew_id,
        tripId: payload.trip_id,
        payload: {
          crew_id: payload.crew_id,
          trip_id: payload.trip_id,
          from_id: payload.from_uid,
          to_id: payload.to_uid,
          reason: 'payee_forgave',
        },
      });
      return { written_off_minor: payload.amount_minor };
    }),
});
