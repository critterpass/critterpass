/**
 * Centrifugo subscribe/publish proxies against real Postgres (ACL through RLS helpers) and real
 * Redis (publish rate windows).
 */
import { randomUUID } from 'node:crypto';

import { channelName } from '@cp/domain';
import { runMigrations, withSystem } from '@cp/db';
import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerInternalRtRoutes, RT_PROXY_SECRET_HEADER } from '../../src/routes/internal-rt';

const SECRET = 'test-rt-proxy-secret-0123456789abcdef';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let app: Hono<{ Variables: object }>;

const member = randomUUID();
const organiser = randomUUID();
const outsider = randomUUID();
let crewId: string;
let tripId: string;

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();

  await withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO users (id, status, display_name) VALUES
         ($1, 'registered', 'Mai'), ($2, 'registered', 'Organiser'), ($3, 'registered', 'Out')`,
      [member, organiser, outsider],
    );
    // users.avatar_id points at a real avatars row.
    const avatarId = randomUUID();
    await tx.query(
      "INSERT INTO avatars (id, user_id, kind, form_id) VALUES ($1, $2, 'critter', 'guide:tokek')",
      [avatarId, member],
    );
    await tx.query('UPDATE users SET avatar_id = $1 WHERE id = $2', [avatarId, member]);
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Crew', $1) RETURNING id",
      [organiser],
    );
    crewId = crew.rows[0]!.id;
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [crewId, organiser, member],
    );
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
      [crewId],
    );
    tripId = trip.rows[0]!.id;
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [tripId, organiser, member],
    );
  });

  app = new Hono<{ Variables: object }>();
  registerInternalRtRoutes(app, { pool, redis, proxySecret: SECRET });
}, 180_000);

afterAll(async () => {
  await pool.end();
  redis.destroy();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

interface ProxyResponse {
  readonly result?: {
    readonly info?: { readonly name: string | null; readonly avatar: string | null };
    readonly data?: {
      readonly v: number;
      readonly id: string;
      readonly type: string;
      readonly data: Record<string, unknown>;
    };
    readonly skip_history?: boolean;
  };
  readonly error?: { readonly code: number };
}

async function call(
  path: 'subscribe' | 'publish',
  body: unknown,
  secret: string | null = SECRET,
): Promise<{ status: number; json: ProxyResponse }> {
  const response = await app.request(`/internal/rt/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret !== null ? { [RT_PROXY_SECRET_HEADER]: secret } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: (await response.json()) as ProxyResponse };
}

const subscribe = (user: string, channel: string) =>
  call('subscribe', { client: randomUUID(), transport: 'websocket', user, channel });

const publish = (user: string, channel: string, data: unknown) =>
  call('publish', { client: randomUUID(), transport: 'websocket', user, channel, data });

describe('proxy authentication', () => {
  it('rejects a call without or with the wrong shared header', async () => {
    expect((await call('subscribe', { user: member, channel: 'x' }, null)).status).toBe(401);
    expect((await call('publish', { user: member, channel: 'x' }, 'wrong')).status).toBe(401);
  });
});

describe('POST /internal/rt/subscribe', () => {
  it('allows a member and attaches presence info on a presence namespace', async () => {
    const { status, json } = await subscribe(member, channelName('crew_chat', crewId));
    expect(status).toBe(200);
    expect(json.result?.info).toEqual({ name: 'Mai', avatar: expect.any(String) as string });
  });

  it('allows without info on a namespace without presence', async () => {
    const { json } = await subscribe(member, channelName('crew_money', crewId));
    expect(json).toEqual({ result: {} });
  });

  it('denies an outsider, an unknown namespace and a malformed channel with 403', async () => {
    expect((await subscribe(outsider, channelName('crew', crewId))).json).toEqual({
      error: { code: 403, message: 'permission denied' },
    });
    expect((await subscribe(member, `poll:${crewId}`)).json.error?.code).toBe(403);
    expect((await subscribe(member, 'crew')).json.error?.code).toBe(403);
    expect((await subscribe('not-a-uuid', channelName('crew', crewId))).json.error?.code).toBe(403);
  });

  it('keeps trip_draft to organisers and user channels to their owner', async () => {
    expect(
      (await subscribe(organiser, channelName('trip_draft', tripId))).json.result,
    ).toBeDefined();
    expect((await subscribe(member, channelName('trip_draft', tripId))).json.error?.code).toBe(403);
    expect((await subscribe(member, channelName('user', member))).json.result).toBeDefined();
    expect((await subscribe(member, channelName('user', organiser))).json.error?.code).toBe(403);
  });
});

describe('POST /internal/rt/publish', () => {
  it('drops a client publish of a server-only type such as message.created', async () => {
    const { status, json } = await publish(member, channelName('crew_chat', crewId), {
      type: 'message.created',
      data: { text: 'hi' },
    });
    expect(status).toBe(200);
    expect(json.error?.code).toBe(403);
  });

  it('drops publishes on namespaces without client publish, and from non-members', async () => {
    expect(
      (await publish(member, channelName('crew', crewId), { type: 'typing' })).json.error?.code,
    ).toBe(403);
    expect(
      (await publish(outsider, channelName('crew_chat', crewId), { type: 'typing' })).json.error
        ?.code,
    ).toBe(403);
  });

  it('drops an oversize publication with 413', async () => {
    const { json } = await publish(member, channelName('trip_presence', tripId), {
      type: 'here',
      data: { screen: 'x'.repeat(600), day: 1 },
    });
    expect(json.error?.code).toBe(413);
  });

  it('rewrites an allowed publish into a server envelope carrying the verified uid', async () => {
    const { json } = await publish(member, channelName('trip_presence', tripId), {
      type: 'cursor',
      data: { anchor: `plan_item:${randomUUID()}` },
    });
    expect(json.result?.skip_history).toBe(true);
    expect(json.result?.data).toMatchObject({ v: 1, type: 'cursor', data: { uid: member } });
  });

  it('rate-limits typing sent at 2/s to at most one per 3 s', async () => {
    const channel = channelName('crew_chat', crewId);
    const startedAt = Date.now();
    const outcomes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const { json } = await publish(organiser, channel, { type: 'typing' });
      outcomes.push(json.error?.code ?? 200);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    expect(Date.now() - startedAt).toBeLessThan(3000 + 500);
    expect(outcomes.filter((code) => code === 200)).toHaveLength(1);
    expect(outcomes.filter((code) => code === 429)).toHaveLength(5);

    await new Promise((resolve) => setTimeout(resolve, Math.max(0, startedAt + 3100 - Date.now())));
    expect((await publish(organiser, channel, { type: 'typing' })).json.error).toBeUndefined();
  }, 15_000);
});
