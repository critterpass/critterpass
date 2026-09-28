/**
 * `/v1/admin/*` guard: Cloudflare Access, the console session (12 h absolute), the allow-list and
 * role policy on every read and command. Real Better Auth, Postgres and Redis.
 */
import { adminMeSchema } from '@cp/domain';
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createAccessVerifier } from '../../src/admin/access';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from '../../src/admin/registry';
import { startAdminHarness, type AdminHarness } from './harness';

let harness: AdminHarness;

const probeArea = defineAdminArea({
  id: 'probe',
  reads: [
    defineAdminRead({
      path: '/probe/flags',
      area: 'flags',
      summary: 'probe read in the flags area',
      response: z.object({ ok: z.boolean() }),
      run: () => Promise.resolve({ ok: true }),
    }),
  ],
  commands: [
    defineAdminCommand({
      name: 'set_feature_flag',
      schema: z.object({ key: z.string() }),
      audit: (payload) => ({ targetKind: 'config', detail: { key: payload.key } }),
      handle: () => Promise.resolve({ ok: true }),
    }),
  ],
});

beforeAll(async () => {
  harness = await startAdminHarness();
  await harness.seedOperator('owner@critterpass.test', ['owner']);
  await harness.seedOperator('support@critterpass.test', ['support']);
  await harness.seedOperator('ops@critterpass.test', ['ops']);
  await harness.seedOperator('nobody@critterpass.test', []);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function errorCode(response: Response): Promise<string> {
  const body = (await response.json()) as { error: { code: string } };
  return body.error.code;
}

describe('console session', () => {
  it('returns the operator, roles and openable areas from /me', async () => {
    const app = harness.app();
    const cookie = await app.signIn('support@critterpass.test');
    const response = await app.request('/v1/admin/me', { headers: { cookie } });
    expect(response.status).toBe(200);
    const me = adminMeSchema.parse(await response.json());
    expect(me.roles).toEqual(['support']);
    expect(me.areas).toEqual(['home', 'work', 'moderation', 'support', 'feedback', 'billing']);
    await app.close();
  });

  it('refuses a request without a session', async () => {
    const app = harness.app();
    const response = await app.request('/v1/admin/me');
    expect(response.status).toBe(401);
    expect(await errorCode(response)).toBe('AUTH_REQUIRED');
    await app.close();
  });

  it('forbids a role-less operator and one removed from the allow-list', async () => {
    const app = harness.app();
    const roleless = await app.signIn('nobody@critterpass.test');
    const denied = await app.request('/v1/admin/me', { headers: { cookie: roleless } });
    expect(denied.status).toBe(403);
    expect(await errorCode(denied)).toBe('FORBIDDEN');

    const support = await app.signIn('support@critterpass.test');
    const narrowed = harness.app({ allowlist: 'owner@critterpass.test' });
    const removed = await narrowed.request('/v1/admin/me', { headers: { cookie: support } });
    expect(removed.status).toBe(403);
    await Promise.all([app.close(), narrowed.close()]);
  });

  it('ends a session 12 h after sign-in regardless of use', async () => {
    const later = new Date(Date.now() + 12 * 60 * 60 * 1000 + 1000);
    const app = harness.app({ now: () => later });
    const cookie = await app.signIn('ops@critterpass.test');
    const response = await app.request('/v1/admin/me', { headers: { cookie } });
    expect(response.status).toBe(401);
    await app.close();
  });

  it('refuses sign-in for an e-mail that is not allow-listed and hides other auth endpoints', async () => {
    const app = harness.app();
    const response = await app.request('/v1/admin/auth/dev/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: 'stranger@critterpass.test' }),
    });
    expect(response.status).toBe(403);
    const hidden = await app.request('/v1/admin/auth/admin/list-users');
    expect(hidden.status).toBe(404);
    await app.close();
  });
});

describe('role policy on reads and commands', () => {
  it('lets ops read the flags area and change a flag, and forbids support both', async () => {
    const app = harness.app({ areas: [probeArea] });
    const ops = await app.signIn('ops@critterpass.test');
    const support = await app.signIn('support@critterpass.test');

    expect((await app.request('/v1/admin/probe/flags', { headers: { cookie: ops } })).status).toBe(
      200,
    );
    const read = await app.request('/v1/admin/probe/flags', { headers: { cookie: support } });
    expect(read.status).toBe(403);

    expect((await app.command(ops, 'set_feature_flag', { key: 'a' })).status).toBe(200);
    const write = await app.command(support, 'set_feature_flag', { key: 'a' });
    expect(write.status).toBe(403);
    expect(await errorCode(write)).toBe('FORBIDDEN');
    await app.close();
  });

  it('forbids a role outside the policy before looking the command up', async () => {
    const app = harness.app({ areas: [probeArea] });
    const ops = await app.signIn('ops@critterpass.test');
    const owner = await app.signIn('owner@critterpass.test');

    // Unlisted names fall to the owner-only default, and a policy-listed command the api doesn't
    // serve is refused the same way, so a forbidden role never learns which commands exist.
    for (const cmd of ['no_such_command', 'approve_content_batch']) {
      const forbidden = await app.command(ops, cmd, {});
      expect(forbidden.status, cmd).toBe(403);
      expect(await errorCode(forbidden)).toBe('FORBIDDEN');
    }

    const unknown = await app.command(owner, 'no_such_command', {});
    expect(unknown.status).toBe(422);
    expect(await errorCode(unknown)).toBe('VALIDATION');
    await app.close();
  });

  it('lets owner run every command', async () => {
    const app = harness.app({ areas: [probeArea] });
    const owner = await app.signIn('owner@critterpass.test');
    expect((await app.command(owner, 'set_feature_flag', { key: 'b' })).status).toBe(200);
    await app.close();
  });

  it('serves the admin OpenAPI document only to operators, never in the public one', async () => {
    const app = harness.app({ areas: [probeArea] });
    expect((await app.request('/v1/admin/openapi.json')).status).toBe(401);
    const owner = await app.signIn('owner@critterpass.test');
    const doc = (await (
      await app.request('/v1/admin/openapi.json', { headers: { cookie: owner } })
    ).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).toContain('/v1/admin/probe/flags');
    const publicDoc = (await (await app.request('/openapi.json')).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(publicDoc.paths).some((path) => path.startsWith('/v1/admin'))).toBe(false);
    await app.close();
  });
});

describe('Cloudflare Access', () => {
  it('rejects a missing or forged assertion and accepts a valid one', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const forger = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const access = createAccessVerifier({
      teamDomain: 'critterpass.cloudflareaccess.com',
      audience: 'aud-console',
      keys: createLocalJWKSet({ keys: [jwk] }),
    });
    const sign = (key: CryptoKey) =>
      new SignJWT({ email: 'owner@critterpass.test' })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer('https://critterpass.cloudflareaccess.com')
        .setAudience('aud-console')
        .setExpirationTime('5m')
        .sign(key);

    const app = harness.app({ access });
    const unsignedSignIn = await app.request('/v1/admin/auth/dev/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: 'owner@critterpass.test' }),
    });
    expect(unsignedSignIn.status).toBe(401);

    const missing = await app.request('/v1/admin/me');
    expect(missing.status).toBe(401);
    const forged = await app.request('/v1/admin/me', {
      headers: { 'cf-access-jwt-assertion': await sign(forger.privateKey) },
    });
    expect(forged.status).toBe(401);

    const assertion = await sign(privateKey);
    const signIn = await app.request('/v1/admin/auth/dev/sign-in', {
      method: 'POST',
      headers: { 'cf-access-jwt-assertion': assertion },
      body: JSON.stringify({ email: 'owner@critterpass.test' }),
    });
    const session = /cp_admin\.session_token=[^;]+/.exec(
      signIn.headers.get('set-cookie') ?? '',
    )?.[0];
    expect(session).toBeDefined();
    const ok = await app.request('/v1/admin/me', {
      headers: { 'cf-access-jwt-assertion': assertion, cookie: session ?? '' },
    });
    expect(ok.status).toBe(200);
    await app.close();
  });
});
