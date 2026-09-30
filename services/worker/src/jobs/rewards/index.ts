/**
 * `reward.fanout`: the one place a verified find is announced and rewarded. Claims the entries it
 * has not announced yet (`announced_at`, so a retried or duplicated job announces nothing twice),
 * announces each to its crews, then runs every registered reward handler with the grant's shared
 * server time.
 */
import { withSystem } from '@cp/db';
import { CRITTER_QUEUES, rewardFanoutJobSchema, type RewardFanoutJob } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { announceFind } from '../critters/crew-hints';
import { rewardHandlers, type GrantedEntry } from './registry';

export {
  registerRewardHandler,
  resetRewardHandlersForTests,
  type GrantedEntry,
  type RewardGrant,
  type RewardHandler,
} from './registry';

export async function fanOutReward(
  pool: pg.Pool,
  job: RewardFanoutJob,
): Promise<{ readonly announced: number }> {
  const grantedAt = new Date(job.granted_at);
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<GrantedEntry>(
      `UPDATE collection_entries c SET announced_at = $2
         FROM critter_forms f
        WHERE c.id = ANY ($1::uuid[]) AND c.announced_at IS NULL AND c.verification = 'verified'
          AND f.id = c.form_id
       RETURNING c.id, c.user_id, c.form_id, c.critter_id, c.trip_id, c.source, f.xp`,
      [job.entry_ids, grantedAt],
    );
    if (rows.length === 0) return { announced: 0 };
    const entries = [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const entry of entries) await announceFind(tx, entry);
    for (const [, handler] of rewardHandlers()) {
      await handler(tx, { kind: job.kind, grantedAt, entries });
    }
    return { announced: entries.length };
  });
}

export function rewardFanoutJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.rewardFanout,
    schema: rewardFanoutJobSchema,
    singletonKey: (data) => [...data.entry_ids].sort().join(','),
    async handler(data, { pool }) {
      return fanOutReward(pool, data);
    },
  });
}
