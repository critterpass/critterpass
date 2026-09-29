/**
 * A migrated database with a crew planning a won trip to Kyoto, and a send-only pg-boss producer
 * whose queues nobody consumes: the setup job suites call their handlers directly and read what
 * each one queued.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { registerJobProducer, resetJobProducerForTests } from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';

import { createBoss } from '../../src/boss';
import { silent, startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export interface SetupWorld {
  readonly harness: JobsHarness;
  readonly boss: PgBoss;
  readonly crewId: string;
  readonly tripId: string;
  readonly members: readonly string[];
  q<T>(sql: string, params?: unknown[]): Promise<T[]>;
  stop(): Promise<void>;
}

export async function startSetupWorld(size = 4): Promise<SetupWorld> {
  const harness = await startJobsHarness();
  const boss = createBoss({
    connectionString: harness.postgres.getConnectionUri(),
    logger: silent,
  });
  await boss.start();
  for (const queue of [...Object.values(SETUP_QUEUES), 'notify.route', 'inbox.fanout']) {
    if ((await boss.getQueue(queue)) === null) await boss.createQueue(queue, { policy: 'stately' });
  }
  registerJobProducer(boss);
  const q = async <T>(sql: string, params: unknown[] = []) =>
    (await harness.pool.query(sql, params)).rows as T[];
  const members = Array.from({ length: size }, () => randomUUID());
  for (const [i, id] of members.entries()) {
    await q(
      `INSERT INTO users (id, status, home_airport, display_name, tz)
       VALUES ($1, 'registered', 'SIN', $2, 'Asia/Singapore')`,
      [id, `Member${i} Tan`],
    );
  }
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Setup crew', $1) RETURNING id",
    [members[0]],
  );
  const crewId = crew?.id as string;
  for (const [i, id] of members.entries()) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      id,
      i === 0 ? 'organiser' : 'member',
    ]);
  }
  const [place] = await q<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, 'Kyoto', 'Japan', 'live', 'USD', 'Asia/Tokyo') RETURNING id`,
    [`kyoto-${randomUUID().slice(0, 8)}`],
  );
  const [trip] = await q<{ id: string }>(
    "INSERT INTO trips (crew_id, status, destination_id, trip_length_days) VALUES ($1, 'voting', $2, 3) RETURNING id",
    [crewId, place?.id],
  );
  const tripId = trip?.id as string;
  await q("UPDATE trips SET status = 'won' WHERE id = $1", [tripId]);
  await q(
    "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
    [tripId, members[0]],
  );
  return {
    harness,
    boss,
    crewId,
    tripId,
    members,
    q,
    async stop() {
      await boss.stop({ graceful: false });
      resetJobProducerForTests();
      await harness.close();
    },
  };
}

/** Jobs queued on `queue` (their data), oldest first. */
export async function queued(pool: pg.Pool, queue: string): Promise<unknown[]> {
  const { rows } = await pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [queue],
  );
  return rows.map((row) => row.data);
}

/** A recorded provider response with `{{Dn}}` / `{{FROM}}` / `{{TO}}` set to dates from `today`. */
export function providerFixture(name: string, today: string): { status: number; body: unknown } {
  const raw = readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
  const day = (offset: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
  const filled = raw
    .replace(/\{\{D(\d+)\}\}/gu, (_match, n: string) => day(Number(n)))
    .replace('{{FROM}}', `${today}T00:00:00Z`)
    .replace('{{TO}}', `${day(183)}T00:00:00Z`);
  return (JSON.parse(filled) as { response: { status: number; body: unknown } }).response;
}
