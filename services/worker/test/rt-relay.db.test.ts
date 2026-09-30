/**
 * The rt_outbox relay, run as the pg-boss `rt.relay` job, against real Postgres and a real
 * Centrifugo running this repo's infra/centrifugo/config.json, observed through centrifuge-js
 * clients. Centrifugo's subscribe proxy points at a local allow-all endpoint: channel ACL is the
 * api's concern (proven by its own suites); here every subscription must succeed so delivery and
 * revocation are what is measured.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import { enqueueRealtime, runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import { channelName } from '@cp/domain';
import { Centrifuge, type PublicationContext } from 'centrifuge';
import pg from 'pg';
import { GenericContainer, TestContainers, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createCentrifugoApi,
  DISCONNECT_RECONNECT_CODE,
  RT_RELAY_MAX_ATTEMPTS,
  rtRelayJob,
  startRtRelayWake,
  type CentrifugoApi,
  type RtRelay,
} from '../src/rt-relay';
import { createBoss, createFailureReporter, startJobRuntime, stopJobRuntime } from '../src/boss';

const API_KEY = 'test-centrifugo-api-key';
const TOKEN_SECRET = 'test-centrifugo-token-secret-0123456789';
const CONFIG = path.resolve(import.meta.dirname, '../../../infra/centrifugo/config.json');
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

let postgres: StartedPostgreSqlContainer;
let centrifugo: StartedTestContainer;
let proxy: Server;
let pool: pg.Pool;
let wsUrl: string;
let apiUrl: string;
const relays: RtRelay[] = [];
const clients: Centrifuge[] = [];

beforeAll(async () => {
  proxy = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ result: {} }));
    });
  });
  await new Promise<void>((resolve) => proxy.listen(0, '0.0.0.0', resolve));
  const proxyPort = (proxy.address() as AddressInfo).port;
  await TestContainers.exposeHostPorts(proxyPort);
  const proxyBase = `http://host.testcontainers.internal:${proxyPort}`;

  [postgres, centrifugo] = await Promise.all([
    startPostgres(),
    new GenericContainer('centrifugo/centrifugo:v6.9.6')
      .withCopyFilesToContainer([{ source: CONFIG, target: '/centrifugo/config.json' }])
      .withCommand(['centrifugo', '--config=/centrifugo/config.json'])
      .withEnvironment({
        CENTRIFUGO_ENGINE_TYPE: 'memory',
        CENTRIFUGO_HTTP_API_KEY: API_KEY,
        CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: TOKEN_SECRET,
        CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: '*',
        CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_ENDPOINT: `${proxyBase}/subscribe`,
        CENTRIFUGO_CHANNEL_PROXY_PUBLISH_ENDPOINT: `${proxyBase}/publish`,
      })
      // Clients connect on the public port; the server API and /health live on the internal one.
      .withExposedPorts(8000, 9000)
      .withWaitStrategy(Wait.forHttp('/health', 9000))
      .start(),
  ]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  wsUrl = `ws://${centrifugo.getHost()}:${centrifugo.getMappedPort(8000)}/connection/websocket`;
  apiUrl = `http://${centrifugo.getHost()}:${centrifugo.getMappedPort(9000)}`;
}, 240_000);

afterEach(async () => {
  await Promise.all(relays.splice(0).map((relay) => relay.stop()));
  for (const client of clients.splice(0)) client.disconnect();
  await pool.query('DELETE FROM rt_outbox');
});

afterAll(async () => {
  await pool.end();
  await new Promise((resolve) => proxy.close(resolve));
  await Promise.all([postgres.stop(), centrifugo.stop()]);
});

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function connectionToken(uid: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({ sub: uid, aud: 'rt', exp: Math.floor(Date.now() / 1000) + 900 }),
  );
  const signature = createHmac('sha256', TOKEN_SECRET).update(`${header}.${claims}`).digest();
  return `${header}.${claims}.${base64url(signature)}`;
}

async function connect(uid: string): Promise<Centrifuge> {
  const client = new Centrifuge(wsUrl, { token: connectionToken(uid) });
  // centrifuge-js emits 'error' separately from promise rejections; unhandled it would throw.
  client.on('error', () => undefined);
  clients.push(client);
  client.connect();
  await client.ready(5000);
  return client;
}

interface Watched {
  readonly publications: unknown[];
  readonly unsubscribed: Promise<number>;
}

async function watch(client: Centrifuge, channel: string): Promise<Watched> {
  const sub = client.newSubscription(channel);
  sub.on('error', () => undefined);
  const publications: unknown[] = [];
  sub.on('publication', (ctx: PublicationContext) => publications.push(ctx.data));
  const unsubscribed = new Promise<number>((resolve) =>
    sub.on('unsubscribed', () => resolve(performance.now())),
  );
  sub.subscribe();
  await sub.ready(5000);
  return { publications, unsubscribed };
}

interface CountingApi extends CentrifugoApi {
  readonly publishedKeys: string[];
}

/** The real server API client, recording each idempotency key it sends. */
function countingApi(url = apiUrl): CountingApi {
  const api = createCentrifugoApi({ baseUrl: url, apiKey: API_KEY, timeoutMs: 1000 });
  const publishedKeys: string[] = [];
  return {
    publishedKeys,
    publish: async (channel, data, key) => {
      await api.publish(channel, data, key);
      publishedKeys.push(key);
    },
    broadcast: async (channels, data, key) => {
      const outcome = await api.broadcast(channels, data, key);
      publishedKeys.push(key);
      return outcome;
    },
    unsubscribe: (user, channel) => api.unsubscribe(user, channel),
    disconnect: (user, reason) => api.disconnect(user, reason),
  };
}

/** One worker instance: its own pg-boss consuming `rt.relay` with `api`, plus the LISTEN/sweep wake. */
async function startRelay(api: CentrifugoApi, sweepIntervalMs?: number): Promise<RtRelay> {
  const boss = createBoss({ connectionString: postgres.getConnectionUri(), logger: silent });
  await startJobRuntime({
    boss,
    deps: { pool, logger: silent },
    jobs: [rtRelayJob(api)],
    report: createFailureReporter(silent),
  });
  const wake = startRtRelayWake({
    pool,
    boss,
    ...(sweepIntervalMs !== undefined ? { sweepIntervalMs } : {}),
    logger: silent,
    connectListener: () => new pg.Client({ connectionString: postgres.getConnectionUri() }),
  });
  const relay: RtRelay = {
    wake: () => wake.wake(),
    async stop() {
      await wake.stop();
      await stopJobRuntime(boss, 5000);
    },
  };
  relays.push(relay);
  return relay;
}

function envelope(type: string, data: unknown) {
  return { v: 1, id: randomUUID(), type, at: new Date().toISOString(), data };
}

async function until(check: () => boolean | Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function unpublishedCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    'SELECT count(*) AS n FROM rt_outbox WHERE published_at IS NULL',
  );
  return Number(rows[0]?.n ?? 0);
}

async function seedCrew(): Promise<{ crewId: string; member: string; organiser: string }> {
  const member = randomUUID();
  const organiser = randomUUID();
  const crewId = await withSystem(pool, async (tx) => {
    await tx.query("INSERT INTO users (id, status) VALUES ($1, 'registered'), ($2, 'registered')", [
      member,
      organiser,
    ]);
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
      [organiser],
    );
    const id = rows[0]!.id;
    await tx.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')",
      [id, organiser, member],
    );
    return id;
  });
  return { crewId, member, organiser };
}

describe('rt_outbox relay', () => {
  it('delivers a committed publish to a subscribed centrifuge-js client', async () => {
    const { crewId, member } = await seedCrew();
    const watched = await watch(await connect(member), channelName('crew_money', crewId));
    await startRelay(countingApi());

    const sent = envelope('expense.added', { expense_id: randomUUID() });
    await withSystem(pool, (tx) =>
      enqueueRealtime(tx, { channel: channelName('crew_money', crewId), payload: sent }),
    );
    await until(() => watched.publications.length === 1, 3000);
    expect(watched.publications).toEqual([sent]);
    await until(async () => (await unpublishedCount()) === 0, 2000);
  });

  it('is woken by the commit NOTIFY without waiting for a sweep', async () => {
    const uid = randomUUID();
    const channel = channelName('user', uid);
    const watched = await watch(await connect(uid), channel);
    await startRelay(countingApi(), 60_000);
    await sleep(300);

    await withSystem(pool, (tx) =>
      enqueueRealtime(tx, {
        channel,
        payload: envelope('badge.counts', { needs_you: 0, unread: 0 }),
      }),
    );
    const committedAt = performance.now();
    await until(() => watched.publications.length === 1, 1000);
    expect(performance.now() - committedAt).toBeLessThan(1000);
  });

  it('fans one event out to several channels with a single broadcast', async () => {
    const { crewId, member } = await seedCrew();
    const client = await connect(member);
    const crew = await watch(client, channelName('crew', crewId));
    const bookings = await watch(client, channelName('crew_bookings', crewId));
    const api = countingApi();
    await startRelay(api);

    const sent = envelope('trip.summary', { trip_id: randomUUID() });
    await withSystem(pool, async (tx) => {
      await enqueueRealtime(tx, { channel: channelName('crew', crewId), payload: sent });
      await enqueueRealtime(tx, { channel: channelName('crew_bookings', crewId), payload: sent });
    });
    await until(() => crew.publications.length + bookings.publications.length === 2, 3000);
    expect(crew.publications).toEqual([sent]);
    expect(bookings.publications).toEqual([sent]);
    expect(api.publishedKeys).toEqual([sent.id]);
  });

  it('publishes nothing for a rolled-back transaction, and only after commit', async () => {
    const uid = randomUUID();
    const channel = channelName('user', uid);
    const watched = await watch(await connect(uid), channel);
    await startRelay(countingApi());

    await expect(
      withSystem(pool, async (tx) => {
        await enqueueRealtime(tx, {
          channel,
          payload: envelope('badge.counts', { needs_you: 0, unread: 0 }),
        });
        throw new Error('handler failed');
      }),
    ).rejects.toThrow('handler failed');

    const open = await pool.connect();
    try {
      await open.query('BEGIN');
      await open.query('SET LOCAL ROLE app_system');
      await enqueueRealtime(open, {
        channel,
        payload: envelope('badge.counts', { needs_you: 1, unread: 1 }),
      });
      await sleep(1500);
      expect(watched.publications).toEqual([]);
      await open.query('COMMIT');
    } finally {
      open.release();
    }
    await until(() => watched.publications.length === 1, 3000);
    await sleep(1200);
    expect(watched.publications).toHaveLength(1);
  });

  it('unsubscribes a removed member from every crew channel within 1 s', async () => {
    const { crewId, member } = await seedCrew();
    const client = await connect(member);
    const crew = await watch(client, channelName('crew', crewId));
    const chat = await watch(client, channelName('crew_chat', crewId));
    await startRelay(countingApi());
    await sleep(300);

    await withSystem(pool, (tx) =>
      tx.query("UPDATE crew_members SET status = 'removed' WHERE crew_id = $1 AND user_id = $2", [
        crewId,
        member,
      ]),
    );
    const committedAt = performance.now();
    const [crewGone, chatGone] = await Promise.all([crew.unsubscribed, chat.unsubscribed]);
    expect(crewGone - committedAt).toBeLessThan(1000);
    expect(chatGone - committedAt).toBeLessThan(1000);
  });

  it('disconnects every connection of a user whose session was revoked', async () => {
    const uid = randomUUID();
    const client = await connect(uid);
    const disconnected = new Promise<number>((resolve) =>
      client.on('connecting', (ctx) => resolve(ctx.code)),
    );
    await startRelay(countingApi());
    await withSystem(pool, (tx) =>
      enqueueRealtime(tx, {
        channel: channelName('user', uid),
        payload: { type: 'session.revoked' },
        kind: 'disconnect',
      }),
    );
    expect(await disconnected).toBe(DISCONNECT_RECONNECT_CODE);
  });

  it('never double-publishes with two relays racing over the same backlog', async () => {
    const uid = randomUUID();
    const channel = channelName('user', uid);
    const watched = await watch(await connect(uid), channel);
    const apiA = countingApi();
    const apiB = countingApi();

    await withSystem(pool, async (tx) => {
      for (let i = 0; i < 250; i += 1) {
        await enqueueRealtime(tx, {
          channel,
          payload: envelope('badge.counts', { needs_you: i, unread: i }),
        });
      }
    });
    await startRelay(apiA);
    await startRelay(apiB);

    await until(async () => (await unpublishedCount()) === 0, 15_000);
    await until(() => watched.publications.length >= 250, 5000);
    await sleep(500);
    const keys = [...apiA.publishedKeys, ...apiB.publishedKeys];
    expect(keys).toHaveLength(250);
    expect(new Set(keys).size).toBe(250);
    expect(watched.publications).toHaveLength(250);
  }, 60_000);

  it('retries when Centrifugo is unreachable and parks rows that can never be sent', async () => {
    const channel = channelName('user', randomUUID());
    await withSystem(pool, async (tx) => {
      await enqueueRealtime(tx, {
        channel,
        payload: envelope('badge.counts', { needs_you: 0, unread: 0 }),
      });
      // A row SQL wrote past the write-site check (app.enqueue_rt takes any jsonb).
      await tx.query("SELECT app.enqueue_rt($1, $2, 'publish')", [
        channel,
        JSON.stringify({ no_type: true }),
      ]);
    });
    const relay = await startRelay(countingApi('http://127.0.0.1:9'));
    await until(async () => {
      const { rows } = await pool.query<{ attempts: number }>(
        'SELECT attempts FROM rt_outbox ORDER BY id LIMIT 1',
      );
      return (rows[0]?.attempts ?? 0) >= 1;
    }, 5000);
    await relay.stop();

    const { rows } = await pool.query<{ attempts: number; published_at: Date | null }>(
      'SELECT attempts, published_at FROM rt_outbox ORDER BY id',
    );
    expect(rows[0]?.published_at).toBeNull();
    expect(rows[0]?.attempts).toBeLessThan(RT_RELAY_MAX_ATTEMPTS);

    await startRelay(countingApi());
    await until(async () => (await unpublishedCount()) <= 1, 5000);
    const parked = await pool.query<{ attempts: number; published_at: Date | null }>(
      'SELECT attempts, published_at FROM rt_outbox ORDER BY id',
    );
    expect(parked.rows[0]?.published_at).not.toBeNull();
    expect(parked.rows[1]).toEqual({ attempts: RT_RELAY_MAX_ATTEMPTS, published_at: null });
  });
});
