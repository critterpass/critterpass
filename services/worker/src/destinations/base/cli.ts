/**
 * Runs a base-set build from anywhere that reaches the database, and optionally its follow-up
 * steps inline (the worker queues them instead):
 *
 *   railway run --service worker --environment staging -- \
 *     pnpm --filter @cp/worker exec tsx src/destinations/base/cli.ts \
 *       [--dry-run] [--skip-photos] [--match] [--describe] [--describe-cap-usd=5]
 *
 * `--dry-run` downloads and plans without writing and prints the counts. Photos queue
 * `media.ingest` jobs, which the running worker stores. `--match` gives every base row without a
 * critter its critter; `--describe` writes missing texts (8 at a time) under the daily cap.
 */
import { createPool, registerJobProducer, withSystem } from '@cp/db';
import { PgBoss } from 'pg-boss';

import { BOSS_SCHEMA } from '../../boss/boss';
import { destinationsAi } from '../ai-deps';
import { describeBaseDestination } from '../describe';
import { matchBaseCritters } from '../match';
import { runBaseBuild } from './run';

const flag = (name: string) => process.argv.includes(`--${name}`);
const value = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main(): Promise<void> {
  const connectionString = process.env['DATABASE_DIRECT_URL'] ?? process.env['DATABASE_URL'];
  if (connectionString === undefined) throw new Error('DATABASE_DIRECT_URL is required');
  const pool = createPool({ connectionString, max: 4 });
  const boss = new PgBoss({
    connectionString,
    schema: BOSS_SCHEMA,
    createSchema: false,
    options: '-c role=app_system',
    application_name: 'cp-destinations-base',
    max: 1,
    supervise: false,
    schedule: false,
  });
  try {
    await boss.start();
    registerJobProducer(boss);
    const summary = await runBaseBuild(pool, {
      dryRun: flag('dry-run'),
      skipPhotos: flag('skip-photos'),
    });
    console.log(JSON.stringify(summary, null, 2));
    if (flag('dry-run')) return;
    const ai = destinationsAi(process.env, { pool });
    if (flag('match')) {
      console.log('critters', await matchBaseCritters(pool, { decisions: ai?.decisions ?? null }));
    }
    if (flag('describe') && ai !== null) {
      const capUsd = Number(value('describe-cap-usd') ?? 2);
      const ids = await withSystem(pool, async (tx) => {
        const { rows } = await tx.query<{ id: string }>(
          `SELECT id FROM destinations WHERE origin = 'base' AND NOT (texts ? 'en' AND texts ? 'vi')
            ORDER BY base_rank DESC NULLS LAST`,
        );
        return rows.map((row) => row.id);
      });
      const outcomes: Record<string, number> = {};
      let next = 0;
      const work = async () => {
        for (let i = next++; i < ids.length; i = next++) {
          const id = ids[i];
          if (id === undefined) continue;
          const result = await describeBaseDestination(
            pool,
            {
              gateway: ai.gateway,
              dailyCapMicros: capUsd * 1_000_000,
            },
            id,
          ).catch((error: unknown) => ({ outcome: 'error', reason: String(error) }));
          const key = 'reason' in result ? `${result.outcome}:${result.reason}` : result.outcome;
          outcomes[key] = (outcomes[key] ?? 0) + 1;
          if (key === 'skipped:daily_cap') next = ids.length;
        }
      };
      await Promise.all(Array.from({ length: 8 }, work));
      console.log('texts', outcomes);
    }
  } finally {
    await boss.stop({ graceful: false }).catch(() => undefined);
    await pool.end();
  }
}

if (process.argv[1]?.endsWith('/base/cli.ts') === true) await main();
