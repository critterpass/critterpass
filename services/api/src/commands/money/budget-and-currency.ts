/**
 * `set_trip_budget` (organiser): the crew's group target the budget screen measures spend against,
 * never anyone's private max. `set_crew_settlement_currency` (a crew organiser): the currency every
 * balance is kept in; the change queues `money.rerate`, which re-expresses the crew's ledger in it.
 */
import { assertCurrencyCode } from '@cp/cost-engine';
import { emitEvent, sendInTx } from '@cp/db';
import {
  DomainError,
  MONEY_QUEUES,
  MONEY_RT,
  setCrewSettlementCurrencyPayloadSchema,
  setTripBudgetPayloadSchema,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { isTripOrganiser, loadMoneyTrip, publishMoney } from './shared';

async function requireTripOrganiser(
  tx: Parameters<typeof loadMoneyTrip>[0],
  tripId: string,
): Promise<void> {
  await loadMoneyTrip(tx, tripId);
  if (!(await isTripOrganiser(tx, tripId))) {
    throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
  }
}

export const setTripBudgetCommand = defineCommand({
  name: 'set_trip_budget',
  v: 1,
  schema: setTripBudgetPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requireTripOrganiser(tx, payload.trip_id),
  handle: async (tx, payload, ctx) => {
    const trip = await loadMoneyTrip(tx, payload.trip_id);
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ currency: string; version: number }>(
        `INSERT INTO budget_plans (trip_id, target_minor, currency, locked_at, locked_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (trip_id) DO UPDATE
           SET target_minor = EXCLUDED.target_minor, version = budget_plans.version + 1
         RETURNING currency, version`,
        [payload.trip_id, payload.target_minor, trip.crew_currency, ctx.clock.serverNow, ctx.uid],
      ),
    );
    await publishMoney(tx, trip.crew_id, MONEY_RT.budgetUpdated, { trip_id: trip.id });
    await emitEvent(tx, {
      type: 'budget.target_changed',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'user',
      actorId: ctx.uid,
      crewId: trip.crew_id,
      tripId: trip.id,
      payload: { trip_id: trip.id },
    });
    return {
      trip_id: trip.id,
      target_minor: payload.target_minor,
      currency: rows[0]?.currency ?? trip.crew_currency,
      version: rows[0]?.version ?? 1,
    };
  },
});

export const setCrewSettlementCurrencyCommand = defineCommand({
  name: 'set_crew_settlement_currency',
  v: 1,
  schema: setCrewSettlementCurrencyPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query<{ organiser: boolean }>(
      'SELECT app.is_crew_organiser($1) AS organiser',
      [payload.crew_id],
    );
    if (rows[0]?.organiser !== true) {
      throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
    }
  },
  handle: async (tx, payload, ctx) => {
    const currency = assertCurrencyCode(payload.currency);
    const changed = await asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE crews SET settlement_currency = $2
          WHERE id = $1 AND settlement_currency IS DISTINCT FROM $2 RETURNING id`,
        [payload.crew_id, currency],
      );
      return rows.length > 0;
    });
    if (changed) {
      await sendInTx(
        tx,
        MONEY_QUEUES.rerate,
        { crew_id: payload.crew_id },
        { singletonKey: payload.crew_id },
      );
      await publishMoney(tx, payload.crew_id, MONEY_RT.currencyChanged, {
        crew_id: payload.crew_id,
        currency,
      });
      await emitEvent(tx, {
        type: 'crew.settlement_currency_changed',
        aggregateKind: 'crew',
        aggregateId: payload.crew_id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: payload.crew_id,
        payload: { crew_id: payload.crew_id, currency },
      });
    }
    return { crew_id: payload.crew_id, currency, changed };
  },
});
