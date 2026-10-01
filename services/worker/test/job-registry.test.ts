import { createKillSwitchReader } from '@cp/db';
import { QUEUES, type QueueSpec } from '@cp/domain';
import pg from 'pg';
import type { JobWithMetadata, PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runAttempt, scheduledJobData, type AnyJobDefinition } from '../src/boss';
import { loadWorkerEnv } from '../src/env';
import { buildJobRegistry } from '../src/job-registry';
import { createWorkerLlmObservability } from '../src/obs/langfuse';
import { createLogger } from '../src/obs/logger';
import { createMetricsRecorder } from '../src/obs/metrics';
import { createCopyRenderer, createPushProviders } from '../src/push';

// Every optional integration configured, so each job family registers its scheduled queues.
// The pool is never queried: building the registry only wires dependencies.
const source: Record<string, string> = {
  APP_ENV: 'staging',
  LOG_LEVEL: 'silent',
  DATABASE_DIRECT_URL: 'postgres://registry@127.0.0.1:1/registry',
  REDIS_URL: 'redis://127.0.0.1:1',
  API_INTERNAL_URL: 'http://127.0.0.1:1',
  BILLING_INTERNAL_SECRET: 'registry-test-secret-value',
  SUPPLIERS_INTERNAL_SECRET: 'registry-test-secret-value',
  TRAVELPAYOUTS_TOKEN: 'registry-test-secret-value',
  WEATHERAPI_KEY: 'registry-test-secret-value',
  ANTHROPIC_API_KEY: 'registry-test-secret-value',
  TAVILY_API_KEY: 'registry-test-secret-value',
};

const env = loadWorkerEnv(source);
const pool = new pg.Pool({ connectionString: env.DATABASE_DIRECT_URL });
afterAll(() => pool.end());

const metrics = createMetricsRecorder({ strict: false });
const logger = createLogger({ level: 'silent', service: 'worker', commit: 'test' });
let jobs: AnyJobDefinition[] = [];

beforeAll(async () => {
  jobs = await buildJobRegistry({
    env,
    processEnv: source,
    pool,
    logger,
    aiSwitches: createKillSwitchReader(pool, { tierOf: () => 'standard' }),
    llmObservability: createWorkerLlmObservability({
      publicKey: undefined,
      secretKey: undefined,
      environment: 'test',
      metrics,
    }),
    metrics,
    renderer: createCopyRenderer(),
    pushProviders: createPushProviders(env),
  });
});

describe('job registry', () => {
  it('registers a handler for every scheduled queue in the catalogue', () => {
    const queues = new Set(jobs.map((job) => job.queue));
    const scheduled = Object.entries(QUEUES as Record<string, QueueSpec>)
      .filter(([, spec]) => spec.cron !== undefined)
      .map(([name]) => name);
    expect(scheduled.filter((name) => !queues.has(name))).toEqual([]);
  });

  it('passes every scheduled queue the payload its cron delivers', async () => {
    const scheduled = jobs.filter((job) => job.spec.cron !== undefined);
    expect(scheduled.length).toBeGreaterThan(0);
    // pg-boss stores the data a schedule was registered with; older schedules stored none.
    const deliveries = [scheduledJobData(), null];
    const rejected: string[] = [];
    for (const job of scheduled) {
      for (const data of deliveries) {
        const reached = { handler: false };
        const result = await runAttempt(
          {
            ...job,
            handler: () => {
              reached.handler = true;
              return Promise.resolve();
            },
          },
          {
            id: `${job.queue}-tick`,
            data,
            retryCount: 0,
            retryLimit: 0,
            signal: new AbortController().signal,
            output: null,
          } as unknown as JobWithMetadata<unknown>,
          { pool, boss: {} as PgBoss, logger },
          () => undefined,
        );
        if (result.status !== 'completed' || !reached.handler)
          rejected.push(`${job.queue} (${JSON.stringify(data)})`);
      }
    }
    expect(rejected).toEqual([]);
  });
});
