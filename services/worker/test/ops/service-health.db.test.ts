/**
 * The console's health collector and usage poller against real Postgres and Redis, with the
 * outside HTTP endpoints answered by a recorded fetch: a vendor's error burst turns its row
 * degraded and a later healthy window turns it back; probes write our own services' rows; a
 * hosting platform takes the worst of what it hosts; a service with no evidence gets no row; and
 * Tavily's and Foursquare's usage reaches the snapshot as quota use.
 */
import { startRedis, type StartedRedisContainer } from '@cp/db/testing';
import {
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  callCountKey,
  callLatencyKey,
  epochMinute,
} from '@cp/domain';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { collectServiceHealth, type ServiceHealthEnv } from '../../src/jobs/ops/service-health';
import { pollVendorUsage } from '../../src/jobs/ops/vendor-usage';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let container: StartedRedisContainer;
let redis: RedisClientType;

const env: ServiceHealthEnv = {
  API_INTERNAL_URL: 'http://api.internal:8787',
  POWERSYNC_URL: 'http://powersync.internal:8080',
  SEARXNG_URL: 'http://searxng.internal:8080',
  DATABASE_STORAGE_LIMIT_GB: 10,
};

/** Recorded answers for the endpoints the collector and poller call. */
function recordedFetch(answers: Record<string, { status: number; body?: unknown }>) {
  return ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const answer = answers[url];
    return answer === undefined
      ? Promise.reject(new TypeError(`fetch failed: ${url}`))
      : Promise.resolve(new Response(JSON.stringify(answer.body ?? {}), { status: answer.status }));
  }) as typeof globalThis.fetch;
}

const healthy = recordedFetch({
  'http://api.internal:8787/health': { status: 200, body: { status: 'ok' } },
  'http://powersync.internal:8080/probes/liveness': { status: 200 },
  'http://searxng.internal:8080/healthz': { status: 200 },
  'https://www.cloudflarestatus.com/api/v2/status.json': {
    status: 200,
    body: { status: { indicator: 'none', description: 'All Systems Operational' } },
  },
});

async function writeCalls(
  service: string,
  minute: number,
  calls: number,
  errors: number,
  ms = 300,
) {
  await redis.hSet(callCountKey(service, minute), { calls, errors });
  await redis.rPush(
    callLatencyKey(service, minute),
    Array.from({ length: calls }, () => String(ms)),
  );
}

beforeAll(async () => {
  [harness, container] = await Promise.all([startJobsHarness(), startRedis()]);
  redis = createClient({ url: container.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
}, 240_000);

afterAll(async () => {
  await redis?.close();
  await container?.stop();
  await harness?.close();
});

beforeEach(async () => {
  await redis.flushAll();
  await harness.pool.query('DELETE FROM ops.service_health');
  await redis.sAdd(WORKER_HEARTBEAT_SET, 'worker-1');
  await redis.set(`${WORKER_HEARTBEAT_KEY_PREFIX}worker-1`, '{}', { EX: 30 });
});

const latest = async (service: string) => {
  const { rows } = await harness.pool.query<{ state: string; quota_used_pct: string | null }>(
    'SELECT state, quota_used_pct FROM ops.service_health WHERE service = $1 ORDER BY at DESC LIMIT 1',
    [service],
  );
  return rows[0] ?? null;
};

describe('ops.service_health', { timeout: 60_000 }, () => {
  it('probes our own services and leaves a service with no evidence without a row', async () => {
    const rows = await collectServiceHealth({ pool: harness.pool, redis, env, fetch: healthy });
    const states = new Map(rows.map((row) => [row.service, row.state]));
    expect(states.get('api')).toBe('ok');
    expect(states.get('powersync')).toBe('ok');
    expect(states.get('searxng')).toBe('ok');
    expect(states.get('redis')).toBe('ok');
    expect(states.get('worker')).toBe('ok');
    expect(states.get('planetscale')).toBe('ok');
    expect(states.get('cloudflare')).toBe('ok');
    expect(states.get('railway')).toBe('ok');
    expect(states.has('mapbox')).toBe(false);
    expect(states.has('observability')).toBe(false);
    expect(Number((await latest('planetscale'))?.quota_used_pct)).toBeGreaterThan(0);
  });

  it('marks an unreachable probe down and its hosting platform with it', async () => {
    const rows = await collectServiceHealth({
      pool: harness.pool,
      redis,
      env,
      fetch: recordedFetch({ 'http://api.internal:8787/health': { status: 200 } }),
    });
    const states = new Map(rows.map((row) => [row.service, row.state]));
    expect(states.get('powersync')).toBe('down');
    expect(states.get('railway')).toBe('down');
    expect(states.has('cloudflare')).toBe(false);
  });

  it('flips a vendor to degraded on an error burst and back once its calls are healthy', async () => {
    const now = new Date();
    const minute = epochMinute(now);
    await writeCalls('deepseek', minute, 20, 4);
    await collectServiceHealth({ pool: harness.pool, redis, env, fetch: healthy, now });
    expect((await latest('deepseek'))?.state).toBe('degraded');

    const later = new Date(now.getTime() + 11 * 60_000);
    await writeCalls('deepseek', epochMinute(later), 30, 0);
    await collectServiceHealth({ pool: harness.pool, redis, env, fetch: healthy, now: later });
    expect((await latest('deepseek'))?.state).toBe('ok');
  });

  it('marks a vendor down when most calls fail', async () => {
    const now = new Date();
    await writeCalls('prelude', epochMinute(now), 4, 4);
    await collectServiceHealth({ pool: harness.pool, redis, env, fetch: healthy, now });
    expect((await latest('prelude'))?.state).toBe('down');
  });
});

describe('ops.vendor_usage', { timeout: 60_000 }, () => {
  it("stores Tavily's and Foursquare's quota use for the next health snapshot", async () => {
    const now = new Date();
    await harness.pool.query('DELETE FROM ops.vendor_spend_daily');
    await harness.pool.query(
      `INSERT INTO foursquare_api_usage (month, details_calls, match_calls, search_calls)
       VALUES ($1, 300, 100, 600)
       ON CONFLICT (month) DO UPDATE SET details_calls = 300, match_calls = 100, search_calls = 600`,
      [now.toISOString().slice(0, 7)],
    );
    const outcome = await pollVendorUsage({
      pool: harness.pool,
      redis,
      env: { TAVILY_API_KEY: 'tvly-test', FOURSQUARE_MONTHLY_CALL_CAP: 4000 },
      fetch: recordedFetch({
        'https://api.tavily.com/usage': {
          status: 200,
          body: {
            key: { usage: 900, limit: null },
            account: {
              current_plan: 'Researcher',
              plan_usage: 900,
              plan_limit: 1000,
              paygo_usage: 50,
            },
          },
        },
      }),
      now,
    });
    expect(outcome.failed).toEqual([]);

    await collectServiceHealth({ pool: harness.pool, redis, env, fetch: healthy, now });
    expect(Number((await latest('tavily'))?.quota_used_pct)).toBe(90);
    expect(Number((await latest('foursquare'))?.quota_used_pct)).toBe(25);
    const spend = await harness.pool.query<{ amount_micros: string; source: string }>(
      "SELECT amount_micros::text, source FROM ops.vendor_spend_daily WHERE service = 'tavily'",
    );
    expect(spend.rows).toEqual([{ amount_micros: '400000', source: 'api' }]);
  });
});
