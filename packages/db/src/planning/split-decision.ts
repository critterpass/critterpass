/**
 * Settling a split's decision vote (the crew-can't-agree screen posts one change set per way, all
 * voting on one decision poll): when the poll closes, the winning way's change set is approved by
 * the vote and applied through `app.apply_change_set`, and every other one is rejected; "leave it
 * out" winning rejects them all. A close by ballot happens in the api, a close by deadline in the
 * worker; both register `splitDecisionEventHook`, and only change sets still `voting` are touched
 * (under their row locks), so a poll settles exactly once whichever process closes it.
 */
import { channelName, PLAN_RT } from '@cp/domain';
import type pg from 'pg';

import { outbox } from '../command/outbox';
import { appendDomainEvent, type AppendedDomainEvent } from '../events';

interface SplitSet {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly winner: boolean;
}

export type SplitSettlement =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'settled';
      readonly applied: string | null;
      readonly versionId: string | null;
      readonly rejected: readonly string[];
    };

type SettleEvent = 'change_set.applied' | 'change_set.rejected' | 'change_set.stale';

function event(type: SettleEvent, set: SplitSet, payload: Record<string, unknown> = {}) {
  return {
    type,
    aggregateKind: 'change_set',
    aggregateId: set.id,
    actorKind: 'system' as const,
    actorId: null,
    payload: { trip_id: set.trip_id, change_set_id: set.id, ...payload },
    crewId: set.crew_id,
    tripId: set.trip_id,
  };
}

/** Settles the split change sets on a closed decision poll; runs as `app_system`. */
export async function settleSplitDecision(
  tx: pg.PoolClient,
  pollId: string,
): Promise<SplitSettlement> {
  const { rows: sets } = await tx.query<SplitSet>(
    `SELECT cs.id, cs.trip_id, t.crew_id,
            (p.winner_option_id IS NOT NULL AND p.winner_option_id = o.id) AS winner
       FROM change_sets cs
       JOIN polls p ON p.id = cs.poll_id AND p.kind = 'decision' AND p.status = 'closed'
       JOIN trips t ON t.id = cs.trip_id
       LEFT JOIN poll_options o ON o.poll_id = p.id AND o.kind = 'changeset' AND o.ref_id = cs.id
      WHERE cs.poll_id = $1 AND cs.trigger = 'split' AND cs.status = 'voting'
      ORDER BY cs.id
      FOR UPDATE OF cs`,
    [pollId],
  );
  if (sets.length === 0) return { kind: 'none' };
  let applied: string | null = null;
  let versionId: string | null = null;
  const rejected: string[] = [];
  for (const set of sets.filter((entry) => !entry.winner)) {
    await tx.query("UPDATE change_sets SET status = 'rejected' WHERE id = $1", [set.id]);
    await appendDomainEvent(tx, event('change_set.rejected', set));
    await outbox(tx, channelName('trip_plan', set.trip_id), PLAN_RT.changesetRejected, {
      change_set_id: set.id,
    });
    rejected.push(set.id);
  }
  const winner = sets.find((entry) => entry.winner);
  if (winner !== undefined) {
    await tx.query(
      `UPDATE change_sets SET status = 'approved', approved_by_kind = 'vote', approved_by = NULL
        WHERE id = $1`,
      [winner.id],
    );
    const { rows } = await tx.query<{ version: string | null }>(
      'SELECT app.apply_change_set($1)::text AS version',
      [winner.id],
    );
    versionId = rows[0]?.version ?? null;
    if (versionId === null) {
      await appendDomainEvent(tx, event('change_set.stale', winner));
      await outbox(tx, channelName('trip_plan', winner.trip_id), PLAN_RT.changesetStale, {
        change_set_id: winner.id,
      });
    } else {
      applied = winner.id;
      await appendDomainEvent(
        tx,
        event('change_set.applied', winner, { result_version_id: versionId }),
      );
      await outbox(tx, channelName('trip_plan', winner.trip_id), PLAN_RT.changesetApplied, {
        change_set_id: winner.id,
        version: versionId,
      });
    }
  }
  return { kind: 'settled', applied, versionId, rejected };
}

/**
 * The same-transaction hook both processes register: on `poll.closed`, settle the poll's split
 * change sets as the system, then hand the transaction back in the role it had.
 */
export async function splitDecisionEventHook(
  tx: pg.PoolClient,
  appended: Pick<AppendedDomainEvent, 'id' | 'type'>,
): Promise<void> {
  if (appended.type !== 'poll.closed') return;
  const role = (await tx.query<{ role: string }>('SELECT current_user::text AS role')).rows[0]
    ?.role;
  await tx.query('SET LOCAL ROLE app_system');
  try {
    const { rows } = await tx.query<{ poll_id: string | null }>(
      "SELECT payload->>'poll_id' AS poll_id FROM app.domain_event_for_routing($1)",
      [appended.id],
    );
    const pollId = rows[0]?.poll_id ?? null;
    if (pollId !== null) await settleSplitDecision(tx, pollId);
  } finally {
    if (role !== undefined) await tx.query("SELECT set_config('role', $1, true)", [role]);
  }
}
