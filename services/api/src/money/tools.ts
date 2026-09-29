/**
 * The guide's money tools (docs/api-contracts.md §6). `balances_read` answers who owes whom with
 * the cost engine's numbers (the guide words them, never computes them); `propose_expense` checks a
 * drafted expense against the trip's members and the split rules and hands back the id the
 * member's confirming `add_expense` uses, so nothing is added until a person says so. Both run as
 * the asking member, so RLS keeps them to the member's own crews.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { computeExpenseShares, money } from '@cp/cost-engine';
import { withUser } from '@cp/db';
import { DomainError, generateUuidV7 } from '@cp/domain';
import type pg from 'pg';

import {
  loadMoneyTrip,
  requireAllInTrip,
  requireMoneyMember,
  tripMoneyMembers,
} from '../commands/money/shared';
import { tripNets, tripSettlePlan } from './settle';

function asMember<T>(pool: pg.Pool, context: ToolContext, fn: (tx: pg.PoolClient) => Promise<T>) {
  return withUser(pool, context.uid, 'guide', fn);
}

/** The turn's trip only: the model cannot point a tool at another trip. */
function tripOf(context: ToolContext, requested: string): string {
  if (context.tripId !== null && context.tripId !== requested) {
    throw new DomainError('FORBIDDEN', { reason: 'other_trip' });
  }
  return requested;
}

export function registerMoneyToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  registry.registerToolExecutor('balances_read', (input, context) =>
    asMember(pool, context, async (tx) => {
      const trip = await loadMoneyTrip(tx, tripOf(context, input.trip_id));
      const nets = await tripNets(tx, trip.id, trip.crew_currency);
      const plan = await tripSettlePlan(tx, trip.id, trip.crew_currency);
      return {
        currency: trip.crew_currency,
        per_member_net: nets.map((net) => ({ uid: net.userId, net_minor: Number(net.netMinor) })),
        settle_plan: plan.map((transfer) => ({
          from_uid: transfer.fromId,
          to_uid: transfer.toId,
          amount_minor: Number(transfer.amountMinor),
        })),
      };
    }),
  );
  registry.registerToolExecutor('propose_expense', (input, context) =>
    asMember(pool, context, async (tx) => {
      const tripId = tripOf(context, input.trip_id);
      await requireMoneyMember(tx, tripId, context.uid);
      requireAllInTrip(await tripMoneyMembers(tx, tripId), [
        input.payer_uid,
        ...input.split.members.map((member) => member.uid),
      ]);
      const mode = { equal: 'equal', shares: 'weights', exact: 'fixed' } as const;
      computeExpenseShares({
        total: money(BigInt(input.amount_minor), input.currency),
        mode: mode[input.split.mode],
        payerId: input.payer_uid,
        members: input.split.members.map((member) => ({
          userId: member.uid,
          ...(member.share === undefined
            ? {}
            : input.split.mode === 'exact'
              ? { fixedMinor: BigInt(Math.round(member.share)) }
              : { weight: Math.round(member.share) }),
        })),
      });
      return { draft_id: generateUuidV7() };
    }),
  );
}
