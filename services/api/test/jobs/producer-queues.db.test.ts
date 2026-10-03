/**
 * The api's job producer on a fresh database: every queue it sends to exists after it starts, each
 * with the catalogue's policy (pg-boss fixes a policy at creation, so a wrong one here would stick
 * after every later worker boot), including the planning queues the legs and plan check hooks use,
 * so a command works whichever service deploys first.
 */
import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { queueSpec } from '@cp/domain';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PRODUCER_QUEUES, startJobProducer } from '../../src/jobs/producer';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let boss: PgBoss;

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 2 });
  await runMigrations(pool);
  boss = await startJobProducer({
    connectionString: postgres.getConnectionUri(),
    logger: { error: () => undefined },
  });
}, 240_000);

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await pool?.end();
  await postgres?.stop();
});

describe('job producer queues', () => {
  it('creates every queue it sends to with the catalogue policy', async () => {
    const { rows } = await pool.query<{ name: string; policy: string }>(
      'SELECT name, policy FROM pgboss.queue WHERE name = ANY($1::text[])',
      [PRODUCER_QUEUES],
    );
    const created = new Map(rows.map((row) => [row.name, row.policy]));
    const wrong = PRODUCER_QUEUES.filter((queue) => created.get(queue) !== queueSpec(queue).policy);
    expect(wrong).toEqual([]);
    expect(created.get('plan.legs')).toBe('stately');
    expect(created.get('plan.check')).toBe('stately');
    expect(created.get('disruption.react')).toBe('standard');
  });
});
