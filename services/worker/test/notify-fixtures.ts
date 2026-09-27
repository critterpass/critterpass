/**
 * Seeds for the notification suites (router, roundup, push delivery): real users, crews, devices,
 * tokens, prefs and trips written with the owner connection, plus a started pg-boss so
 * `sendInTx` has a producer. Nothing here fakes the database.
 */
import { randomUUID } from 'node:crypto';

import { resetJobProducerForTests, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';

import { createBoss, ensureQueues, queueSpec, startJobRuntime, stopJobRuntime } from '../src/boss';
import type { AnyJobDefinition } from '../src/boss';

export const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface NotifyDb {
  readonly pool: pg.Pool;
  readonly connectionString: string;
  startBoss(jobs?: readonly AnyJobDefinition[]): Promise<PgBoss>;
  stop(): Promise<void>;
}

export async function startNotifyDb(): Promise<NotifyDb> {
  const postgres: StartedPostgreSqlContainer = await startPostgres();
  const pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 8 });
  await runMigrations(pool);
  const bosses: PgBoss[] = [];
  return {
    pool,
    connectionString: postgres.getConnectionUri(),
    async startBoss(jobs = []) {
      const boss = createBoss({
        connectionString: postgres.getConnectionUri(),
        logger: silentLogger,
      });
      bosses.push(boss);
      await startJobRuntime({
        boss,
        deps: { pool, logger: silentLogger },
        jobs,
        report: () => undefined,
        crons: false,
      });
      // Queues the code under test sends to even when this runtime does not consume them.
      await ensureQueues(
        boss,
        ['notify.route', 'push.send'].map((name) => [name, queueSpec(name)] as const),
      );
      return boss;
    },
    async stop() {
      await Promise.all(bosses.map((boss) => stopJobRuntime(boss, 2000)));
      resetJobProducerForTests();
      await pool.end();
      await postgres.stop();
    },
  };
}

export async function insertUser(
  pool: pg.Pool,
  options: { locale?: string; tz?: string; status?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO users (id, status, locale, tz) VALUES ($1, $2, $3, $4)', [
    id,
    options.status ?? 'registered',
    options.locale ?? 'en',
    options.tz ?? null,
  ]);
  return id;
}

export async function insertDevice(
  pool: pg.Pool,
  userId: string,
  options: {
    platform?: 'ios' | 'android';
    tz?: string;
    locale?: string;
    token?: string | null;
    env?: 'sandbox' | 'prod';
    foreground?: boolean;
  } = {},
): Promise<{ deviceId: string; token: string | undefined }> {
  const deviceId = randomUUID();
  const platform = options.platform ?? 'ios';
  await pool.query(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz, foreground)
     VALUES ($1, $2, $3, '1.0.0', $4, $5, $6)`,
    [
      deviceId,
      userId,
      platform,
      options.locale ?? 'en',
      options.tz ?? 'UTC',
      options.foreground ?? false,
    ],
  );
  if (options.token === null) return { deviceId, token: undefined };
  const token = options.token ?? `${platform}-${randomUUID()}`;
  await pool.query(
    'INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, $2, $3, $4)',
    [deviceId, platform === 'ios' ? 'apns_alert' : 'fcm', token, options.env ?? 'prod'],
  );
  return { deviceId, token };
}

export async function insertCrew(pool: pg.Pool, members: readonly string[]): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO crews (id, name, created_by) VALUES ($1, $2, $3)', [
    id,
    'Bali crew',
    members[0] ?? null,
  ]);
  for (const member of members) {
    await pool.query(
      "INSERT INTO crew_members (crew_id, user_id, status) VALUES ($1, $2, 'active')",
      [id, member],
    );
  }
  return id;
}

/** A trip under way in `tz` with `travellers` on it. */
export async function insertTripUnderWay(
  pool: pg.Pool,
  crewId: string,
  tz: string,
  travellers: readonly string[],
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO trips (id, crew_id, status, tz, start_date, end_date)
     VALUES ($1, $2, 'setup', $3, CURRENT_DATE - 1, CURRENT_DATE + 3)`,
    [id, crewId, tz],
  );
  // The status guard only allows real transitions, so walk the trip to "under way".
  for (const status of [
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
  ]) {
    await pool.query('UPDATE trips SET status = $2 WHERE id = $1', [id, status]);
  }
  for (const uid of travellers) {
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')",
      [id, uid],
    );
  }
  return id;
}

export async function insertEvent(
  pool: pg.Pool,
  type: string,
  payload: Record<string, unknown>,
  refs: { crewId?: string; tripId?: string; actorId?: string; occurredAt?: Date } = {},
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO domain_events (id, type, aggregate_kind, aggregate_id, actor_kind, actor_id, payload,
       crew_id, trip_id, occurred_at)
     VALUES ($1, $2, 'crew', $3, 'user', $4, $5, $3, $6, $7)`,
    [
      id,
      type,
      refs.crewId ?? randomUUID(),
      refs.actorId ?? null,
      JSON.stringify(payload),
      refs.tripId ?? null,
      refs.occurredAt ?? new Date(),
    ],
  );
  return id;
}

export async function queuedJobs(
  pool: pg.Pool,
  queue: string,
): Promise<{ singleton_key: string | null; data: Record<string, unknown> }[]> {
  const { rows } = await pool.query<{
    singleton_key: string | null;
    data: Record<string, unknown>;
  }>('SELECT singleton_key, data FROM pgboss.job WHERE name = $1 ORDER BY created_on', [queue]);
  return rows;
}

export async function until(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
