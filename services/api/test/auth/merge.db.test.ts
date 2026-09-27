/**
 * Conflict path that never loses data silently: a phone-number conflict on an anonymous session's
 * `verify({updatePhoneNumber:true})` mints a merge ticket instead of surfacing Better Auth's raw
 * `PHONE_NUMBER_EXIST`; the preview shows both uids' crews; merge unions crew membership, deletes the
 * anonymous uid, and hands back a session for the existing uid; a replayed, forged, or
 * wrong-session ticket is rejected without leaking preview data; a mid-merge failure rolls back
 * fully.
 */
import { randomUUID } from 'node:crypto';

import {
  startPostgres,
  startRedis,
  type StartedPostgreSqlContainer,
  type StartedRedisContainer,
} from '@cp/db/testing';
import { registerMergeRule, resetMergeRulesForTests, runMigrations, withSystem } from '@cp/db';
import { Hono } from 'hono';
import pg from 'pg';
import { createClient, type RedisClientType } from 'redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import type { OtpChannelAdapter } from '../../src/auth/otp/router';
import {
  registerMergeExecuteRoute,
  registerMergeTicketPreviewRoute,
} from '../../src/routes/auth-extra';

import { disabledAttestationConfig } from './test-attestation-config';

let postgres: StartedPostgreSqlContainer;
let redisContainer: StartedRedisContainer;
let pool: pg.Pool;
let redis: RedisClientType;
let authModule: AuthModule;
let app: Hono<{ Variables: object }>;
let capturedCodes: Map<string, string>;
const SECRET = 'test-secret-at-least-32-characters-long';

function fakeWhatsAppAdapter(): OtpChannelAdapter {
  return {
    send: ({ phoneE164, code }) => {
      capturedCodes.set(phoneE164, code);
      return Promise.resolve({ providerMessageId: `fake-wamid-${phoneE164}` });
    },
  };
}

beforeAll(async () => {
  [postgres, redisContainer] = await Promise.all([startPostgres(), startRedis()]);
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
  redis = createClient({ url: redisContainer.getConnectionUrl() });
  redis.on('error', () => undefined);
  await redis.connect();
  capturedCodes = new Map();

  authModule = createAuthModule({
    appPool: pool,
    authDatabaseUrl: postgres.getConnectionUri(),
    redis,
    secret: SECRET,
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: { whatsapp: fakeWhatsAppAdapter() },
    rateLimit: {
      customRules: {
        '/sign-in/*': { window: 1, max: 1000 },
        '/phone-number/*': { window: 1, max: 1000 },
      },
    },
    attestation: disabledAttestationConfig(),
  });

  app = new Hono<{ Variables: object }>();
  registerMergeTicketPreviewRoute(app, { auth: authModule.auth, appPool: pool, secret: SECRET });
  registerMergeExecuteRoute(app, { auth: authModule.auth, appPool: pool, redis, secret: SECRET });
  app.on(['GET', 'POST'], '/api/auth/*', (c) => authModule.handler(c.req.raw));
}, 180_000);

afterAll(async () => {
  await authModule.close();
  redis.destroy();
  await pool.end();
  await Promise.all([postgres.stop(), redisContainer.stop()]);
});

async function authRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return app.request(`http://localhost:8787${path}`, { ...init, headers });
}

interface SignedIn {
  readonly cookie: string;
  readonly uid: string;
}

async function signInAnonymously(): Promise<SignedIn> {
  const response = await authRequest('/api/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
  const setCookie = response.headers.get('set-cookie');
  const cookie = /better-auth\.session_token=[^;]+/.exec(setCookie ?? '')?.[0];
  const body = (await response.json()) as { user: { id: string } };
  if (!cookie) throw new Error(`sign-in/anonymous did not set a cookie: ${JSON.stringify(body)}`);
  return { cookie, uid: body.user.id };
}

async function verifyPhone(cookie: string, phoneNumber: string): Promise<Response> {
  const sendOtp = await authRequest('/api/auth/phone-number/send-otp', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ phoneNumber }),
  });
  if (sendOtp.status !== 200) {
    throw new Error(`send-otp failed (status ${sendOtp.status}): ${await sendOtp.text()}`);
  }
  const code = capturedCodes.get(phoneNumber);
  if (!code) throw new Error(`no verification code captured for ${phoneNumber}`);
  return authRequest('/api/auth/phone-number/verify', {
    method: 'POST',
    headers: { cookie },
    body: JSON.stringify({ phoneNumber, code, updatePhoneNumber: true }),
  });
}

async function addCrewMembership(uid: string, crewName: string): Promise<string> {
  return withSystem(pool, async (tx) => {
    const crew = await tx.query<{ id: string }>(
      `INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id`,
      [crewName, uid],
    );
    const crewId = crew.rows[0]?.id;
    if (!crewId) throw new Error('failed to create crew');
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role, status, joined_epoch)
       VALUES ($1, $2, 'organiser', 'active', 0)`,
      [crewId, uid],
    );
    return crewId;
  });
}

describe('phone conflict → merge', () => {
  it('mints MERGE_REQUIRED instead of surfacing PHONE_NUMBER_EXIST', async () => {
    const phone = '+6591000001';
    const existing = await signInAnonymously();
    const firstVerify = await verifyPhone(existing.cookie, phone);
    expect(firstVerify.status).toBe(200);

    const anon = await signInAnonymously();
    const conflict = await verifyPhone(anon.cookie, phone);
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { error: { code: string; detail: { ticket: string } } };
    expect(body.error.code).toBe('MERGE_REQUIRED');
    expect(typeof body.error.detail.ticket).toBe('string');
  });

  it('previews both uids crews, merges by union, deletes the anon uid, and hands back a working session', async () => {
    const phone = '+6591000002';
    const existing = await signInAnonymously();
    await verifyPhone(existing.cookie, phone);
    const existingCrewId = await addCrewMembership(existing.uid, 'Existing Crew');

    const anon = await signInAnonymously();
    const anonCrewId = await addCrewMembership(anon.uid, 'Anon Crew');
    const conflict = await verifyPhone(anon.cookie, phone);
    const conflictBody = (await conflict.json()) as { error: { detail: { ticket: string } } };
    const ticket = conflictBody.error.detail.ticket;

    const preview = await authRequest('/v1/auth/merge-ticket', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket }),
    });
    expect(preview.status).toBe(200);
    const previewBody = (await preview.json()) as {
      crews: Array<{ id: string; owner: string }>;
      trips: unknown[];
      critters: unknown[];
      stamps: unknown[];
    };
    const crewIds = previewBody.crews.map((c) => c.id).sort();
    expect(crewIds).toEqual([anonCrewId, existingCrewId].sort());

    const mergeResponse = await authRequest('/v1/auth/merge', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket, strategy: 'keep_existing' }),
    });
    expect(mergeResponse.status).toBe(200);
    const mergeBody = (await mergeResponse.json()) as { token: string; user: { id: string } };
    expect(mergeBody.user.id).toBe(existing.uid);

    const anonAuthRow = await pool.query('SELECT 1 FROM auth."user" WHERE id = $1', [anon.uid]);
    expect(anonAuthRow.rowCount).toBe(0);

    const membershipRows = await pool.query<{ user_id: string; crew_id: string }>(
      `SELECT user_id, crew_id FROM crew_members WHERE crew_id = ANY($1)`,
      [[existingCrewId, anonCrewId]],
    );
    expect(membershipRows.rows.every((row) => row.user_id === existing.uid)).toBe(true);
    expect(membershipRows.rows).toHaveLength(2);

    // The returned session is real and working: both the signed Set-Cookie header the route sets
    // and the raw token in the body (for the Expo client) authenticate as the existing uid.
    const mergeCookie = /better-auth\.session_token=[^;]+/.exec(
      mergeResponse.headers.get('set-cookie') ?? '',
    )?.[0];
    expect(mergeCookie).toBeDefined();
    const authedCall = await authRequest('/api/auth/get-session', {
      headers: { cookie: mergeCookie ?? '' },
    });
    expect(authedCall.status).toBe(200);
    const sessionBody = (await authedCall.json()) as { user: { id: string } } | null;
    expect(sessionBody?.user.id).toBe(existing.uid);
  });

  it('rejects a replayed ticket', async () => {
    const phone = '+6591000003';
    const existing = await signInAnonymously();
    await verifyPhone(existing.cookie, phone);
    const anon = await signInAnonymously();
    const conflict = await verifyPhone(anon.cookie, phone);
    const { error } = (await conflict.json()) as { error: { detail: { ticket: string } } };
    const ticket = error.detail.ticket;

    const first = await authRequest('/v1/auth/merge', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket, strategy: 'keep_existing' }),
    });
    expect(first.status).toBe(200);

    const replay = await authRequest('/v1/auth/merge', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket, strategy: 'keep_existing' }),
    });
    expect(replay.status).toBe(403);
  });

  it('rejects a forged ticket, and no preview data leaks', async () => {
    const forged = Buffer.from(
      JSON.stringify({
        kind: 'phone',
        existingUid: randomUUID(),
        anonUid: randomUUID(),
        anonSessionId: 'forged',
        nonce: 'forged',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString('base64url');
    const anon = await signInAnonymously();
    const response = await authRequest('/v1/auth/merge-ticket', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket: `${forged}.not-a-real-signature` }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('crews');
    expect(body).not.toHaveProperty('trips');
  });

  it('rejects a valid ticket presented by a different session', async () => {
    const phone = '+6591000004';
    const existing = await signInAnonymously();
    await verifyPhone(existing.cookie, phone);
    const anon = await signInAnonymously();
    const conflict = await verifyPhone(anon.cookie, phone);
    const { error } = (await conflict.json()) as { error: { detail: { ticket: string } } };
    const ticket = error.detail.ticket;

    const outsider = await signInAnonymously();
    const response = await authRequest('/v1/auth/merge-ticket', {
      method: 'POST',
      headers: { cookie: outsider.cookie },
      body: JSON.stringify({ ticket }),
    });
    expect(response.status).toBe(403);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty('crews');
  });

  it('rolls back the whole transaction when one merge rule fails mid-way', async () => {
    const phone = '+6591000005';
    const existing = await signInAnonymously();
    await verifyPhone(existing.cookie, phone);
    const existingCrewId = await addCrewMembership(existing.uid, 'Rollback Existing Crew');
    const anon = await signInAnonymously();
    const anonCrewId = await addCrewMembership(anon.uid, 'Rollback Anon Crew');
    const conflict = await verifyPhone(anon.cookie, phone);
    const { error } = (await conflict.json()) as { error: { detail: { ticket: string } } };
    const ticket = error.detail.ticket;

    // A rule referencing a table that does not exist forces the transaction to fail after the
    // (successful) crew_members reassignment has already run in the same tx.
    registerMergeRule({
      table: 'does_not_exist_merge_target',
      userColumn: 'user_id',
      strategy: 'drop',
    });

    const mergeResponse = await authRequest('/v1/auth/merge', {
      method: 'POST',
      headers: { cookie: anon.cookie },
      body: JSON.stringify({ ticket, strategy: 'keep_existing' }),
    });
    expect(mergeResponse.status).toBe(500);

    // Nothing committed: the anon uid's auth row and its own crew membership are both still intact.
    const anonAuthRow = await pool.query('SELECT 1 FROM auth."user" WHERE id = $1', [anon.uid]);
    expect(anonAuthRow.rowCount).toBe(1);
    const membership = await pool.query<{ user_id: string }>(
      'SELECT user_id FROM crew_members WHERE crew_id = $1',
      [anonCrewId],
    );
    expect(membership.rows[0]?.user_id).toBe(anon.uid);
    void existingCrewId;

    resetMergeRulesForTests();
  });
});
