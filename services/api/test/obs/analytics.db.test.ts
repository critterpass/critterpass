import { randomUUID } from 'node:crypto';

import { runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { userPid } from '@cp/domain';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServerAnalytics, type ServerAnalytics } from '../../src/obs/analytics';

const SALT = 'test-analytics-pid-salt';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let analytics: ServerAnalytics;
/** PostHog's HTTP boundary: every captured event, answered like the real `/batch/`. */
const captured: { event: string; distinct_id: string; properties: Record<string, unknown> }[] = [];

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
  analytics = createServerAnalytics({
    pool,
    projectApiKey: 'phc_test',
    pidSalt: SALT,
    sdk: {
      flushAt: 1,
      disableCompression: true,
      fetch: (_url, init) => {
        const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}') as {
          batch: typeof captured;
        };
        captured.push(...body.batch);
        return Promise.resolve({
          status: 200,
          text: () => Promise.resolve('{"status":1}'),
          json: () => Promise.resolve({ status: 1 }),
          headers: { get: () => null },
        } as never);
      },
    },
  });
}, 240_000);

afterAll(async () => {
  await analytics.shutdown();
  await pool.end();
  await postgres.stop();
});

async function user(consented: boolean | null): Promise<string> {
  const id = randomUUID();
  await pool.query(`INSERT INTO users (id, status, locale) VALUES ($1, 'registered', 'en')`, [id]);
  if (consented !== null) {
    await pool.query(
      `INSERT INTO consents (user_id, purpose, granted_at, revoked_at)
       VALUES ($1, 'analytics', now(), CASE WHEN $2 THEN NULL ELSE now() END)`,
      [id, consented],
    );
  }
  return id;
}

describe('serverTrack', { timeout: 60_000 }, () => {
  it('applies the consent rules and never sends the uid', async () => {
    const [yes, no] = [await user(true), await user(false)];
    expect(
      await analytics.serverTrack(
        'widget_action',
        { kind: 'ballot', surface: 'widget' },
        { uid: yes },
      ),
    ).toBe('sent');
    expect(
      await analytics.serverTrack(
        'widget_action',
        { kind: 'ballot', surface: 'widget' },
        { uid: no },
      ),
    ).toBe('skipped_no_consent');
    expect(
      await analytics.serverTrack('purchase_refunded', { product: 'pass_monthly' }, { uid: no }),
    ).toBe('sent');
    expect(
      await analytics.serverTrack('link_clicked', { type: 'invite', is_bot: false }, { uid: null }),
    ).toBe('sent');
    expect(
      await analytics.serverTrack(
        'link_clicked',
        { type: 'invite', is_bot: false, note: 'x' } as never,
        { uid: null },
      ),
    ).toBe('rejected');
    await analytics.shutdown();

    const pid = await userPid(yes, SALT);
    expect(captured.map((event) => [event.event, event.distinct_id === pid])).toEqual([
      ['widget_action', true],
      ['purchase_refunded', false],
      ['link_clicked', false],
    ]);
    expect(captured[0]?.properties).toMatchObject({
      user_pid: pid,
      surface: 'widget',
      platform: 'server',
    });
    expect(captured[1]?.properties['$process_person_profile']).toBe(false);
    expect(JSON.stringify(captured)).not.toContain(yes);
    expect(JSON.stringify(captured)).not.toContain(no);
  });
});
