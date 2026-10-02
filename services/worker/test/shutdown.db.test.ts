/**
 * The worker's stop on SIGTERM against a real pg-boss and a real health server: a job that is
 * mid-run when the signal arrives is finished or failed back to its queue (retryable at once),
 * never left `active` until its expiry, even while a keep-alive health connection is still open.
 */
import { createServer, request, Agent, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { PgBoss } from 'pg-boss';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineJob, enqueue, stopJobRuntime } from '../src/boss';
import { createShutdown } from '../src/shutdown';
import {
  fastSpec,
  startJobsHarness,
  uniqueQueue,
  until,
  type JobsHarness,
} from './helpers/jobs-harness';

let harness: JobsHarness;
const agents: Agent[] = [];

beforeAll(async () => {
  harness = await startJobsHarness();
}, 240_000);

afterEach(async () => {
  for (const agent of agents.splice(0)) agent.destroy();
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

const silentLogger = { info: () => undefined, error: () => undefined };
const payload = z.object({ ms: z.number().int() });

async function healthServer(): Promise<Server> {
  const server = createServer((_req, res) => res.end('ok'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/** One health check over a keep-alive connection that stays open afterwards. */
async function holdKeepAlive(server: Server): Promise<void> {
  const agent = new Agent({ keepAlive: true });
  agents.push(agent);
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/health', agent }, (res) => {
      res.resume();
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.end();
  });
}

async function jobState(queue: string, id: string): Promise<string | undefined> {
  const { rows } = await harness.pool.query<{ state: string }>(
    'SELECT state::text AS state FROM pgboss.job WHERE name = $1 AND id = $2',
    [queue, id],
  );
  return rows[0]?.state;
}

async function runUntilSignal(ms: number, stopTimeoutMs: number) {
  const queue = uniqueQueue('sigterm');
  let started = false;
  const job = defineJob({
    queue,
    spec: fastSpec(),
    schema: payload,
    pollingIntervalSeconds: 0.5,
    handler: async ({ ms: wait }) => {
      started = true;
      await new Promise((resolve) => setTimeout(resolve, wait));
    },
  });
  const boss: PgBoss = await harness.startRuntime([job]);
  const id = (await enqueue(boss, job, { ms })) ?? '';
  const server = await healthServer();
  await holdKeepAlive(server);
  await until(() => started, 10_000);
  expect(await jobState(queue, id)).toBe('active');

  const exits: number[] = [];
  const shutdown = createShutdown({
    server,
    started: Promise.resolve(),
    stops: [() => stopJobRuntime(boss, stopTimeoutMs)],
    closes: [],
    logger: silentLogger,
    exit: (code) => exits.push(code),
  });
  const begun = Date.now();
  await shutdown('SIGTERM');
  return { queue, id, exits, tookMs: Date.now() - begun };
}

describe('worker stop on SIGTERM', () => {
  it('lets a short job in flight finish, with a keep-alive health connection open', async () => {
    const run = await runUntilSignal(1500, 10_000);
    expect(run.exits).toEqual([0]);
    expect(await jobState(run.queue, run.id)).toBe('completed');
  }, 60_000);

  it('fails a long job back to its queue once the stop timeout passes, never leaving it active', async () => {
    const run = await runUntilSignal(60_000, 500);
    expect(run.exits).toEqual([0]);
    expect(run.tookMs).toBeLessThan(10_000);
    expect(['retry', 'created']).toContain(await jobState(run.queue, run.id));
  }, 60_000);
});
