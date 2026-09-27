/**
 * Device action keys: valid signature passes; body tamper, stale ts, revoked key, and missing scope
 * are each rejected with `ACTION_KEY_SCOPE`. Real Postgres (Testcontainers), real AES-256-GCM
 * envelope encryption, real HMAC-SHA256 signing — only the clock is injected, for the stale-timestamp
 * case.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';

import { crypto as dbCrypto, runMigrations } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { issueActionKey, rotateActionKeyIfDue } from '../../src/auth/action-keys/issue';
import {
  revokeActionKey,
  revokeActionKeysForDevice,
  revokeActionKeysForUser,
} from '../../src/auth/action-keys/revoke';
import { verifyActionKeyRequest } from '../../src/auth/action-keys/verify';

const { parseFieldEncryptionKeys } = dbCrypto;

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
const keyring = {
  activeKeyId: 'k1',
  keys: parseFieldEncryptionKeys(`k1:${Buffer.alloc(32, 9).toString('base64')}`),
};

async function createUser(): Promise<string> {
  const id = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [id]);
  return id;
}

/** A real install row for `userId`: every action key belongs to one. */
async function createDevice(userId: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
     VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
    [id, userId],
  );
  return id;
}

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 10 });
  await runMigrations(pool);
}, 180_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

function sign(secret: string, method: string, path: string, ts: string, body: string): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  const message = `${method}\n${path}\n${ts}\n${bodyHash}`;
  return createHmac('sha256', secret).update(message).digest('base64url');
}

function signedHeaders(
  secret: string,
  keyId: string,
  method: string,
  path: string,
  body: string,
  ts: string,
): Headers {
  return new Headers({
    'x-cp-key-id': keyId,
    'x-cp-ts': ts,
    'x-cp-sig': sign(secret, method, path, ts, body),
  });
}

describe('device action keys', () => {
  it('accepts a validly signed request and records last_used_at', async () => {
    const userId = await createUser();
    const deviceId = await createDevice(userId);
    const issued = await issueActionKey(pool, { userId, deviceId, scopes: ['ballot'] }, keyring);
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ option_id: 'opt-1' });
    const headers = signedHeaders(issued.secret, issued.keyId, 'POST', '/v1/actions', body, ts);

    const result = await verifyActionKeyRequest(
      { method: 'POST', path: '/v1/actions', headers, body },
      'ballot',
      { appPool: pool, keyring },
    );
    expect(result).toEqual({ keyId: issued.keyId, userId, deviceId, scopes: ['ballot'] });

    const { rows } = await pool.query<{ last_used_at: Date | null }>(
      'SELECT last_used_at FROM device_action_keys WHERE key_id = $1',
      [issued.keyId],
    );
    expect(rows[0]?.last_used_at).not.toBeNull();
  });

  it('rejects a tampered body (signature covers the body hash)', async () => {
    const userId = await createUser();
    const issued = await issueActionKey(
      pool,
      { userId, deviceId: await createDevice(userId), scopes: ['ballot'] },
      keyring,
    );
    const ts = String(Math.floor(Date.now() / 1000));
    const originalBody = JSON.stringify({ option_id: 'opt-1' });
    const headers = signedHeaders(
      issued.secret,
      issued.keyId,
      'POST',
      '/v1/actions',
      originalBody,
      ts,
    );
    const tamperedBody = JSON.stringify({ option_id: 'opt-2' });

    await expect(
      verifyActionKeyRequest(
        { method: 'POST', path: '/v1/actions', headers, body: tamperedBody },
        'ballot',
        { appPool: pool, keyring },
      ),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'bad_signature' } });
  });

  it('rejects a stale timestamp', async () => {
    const userId = await createUser();
    const issued = await issueActionKey(
      pool,
      { userId, deviceId: await createDevice(userId), scopes: ['ballot'] },
      keyring,
    );
    const staleTs = String(Math.floor(Date.now() / 1000) - 1000);
    const body = '{}';
    const headers = signedHeaders(
      issued.secret,
      issued.keyId,
      'POST',
      '/v1/actions',
      body,
      staleTs,
    );

    await expect(
      verifyActionKeyRequest({ method: 'POST', path: '/v1/actions', headers, body }, 'ballot', {
        appPool: pool,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'stale_timestamp' } });
  });

  it('rejects a revoked key', async () => {
    const userId = await createUser();
    const issued = await issueActionKey(
      pool,
      { userId, deviceId: await createDevice(userId), scopes: ['ballot'] },
      keyring,
    );
    await revokeActionKey(pool, issued.keyId);
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{}';
    const headers = signedHeaders(issued.secret, issued.keyId, 'POST', '/v1/actions', body, ts);

    await expect(
      verifyActionKeyRequest({ method: 'POST', path: '/v1/actions', headers, body }, 'ballot', {
        appPool: pool,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'revoked_or_expired' } });
  });

  it("rejects a request outside the key's granted scopes", async () => {
    const userId = await createUser();
    const issued = await issueActionKey(
      pool,
      { userId, deviceId: await createDevice(userId), scopes: ['readiness'] },
      keyring,
    );
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{}';
    const headers = signedHeaders(issued.secret, issued.keyId, 'POST', '/v1/actions', body, ts);

    await expect(
      verifyActionKeyRequest({ method: 'POST', path: '/v1/actions', headers, body }, 'ballot', {
        appPool: pool,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'missing_scope' } });
  });

  it('rejects an unknown key id', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{}';
    const headers = signedHeaders(
      'any-secret',
      'not-a-real-key-id',
      'POST',
      '/v1/actions',
      body,
      ts,
    );

    await expect(
      verifyActionKeyRequest({ method: 'POST', path: '/v1/actions', headers, body }, 'ballot', {
        appPool: pool,
        keyring,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'revoked_or_expired' } });
  });

  it('rejects a request missing a required header', async () => {
    const headers = new Headers({ 'x-cp-key-id': 'k', 'x-cp-ts': '1' });
    await expect(
      verifyActionKeyRequest(
        { method: 'POST', path: '/v1/actions', headers, body: '{}' },
        'ballot',
        { appPool: pool, keyring },
      ),
    ).rejects.toMatchObject({ code: 'ACTION_KEY_SCOPE', detail: { reason: 'missing_headers' } });
  });

  describe('rotation', () => {
    it('does not rotate a key with more than 7 days remaining', async () => {
      const userId = await createUser();
      const issued = await issueActionKey(
        pool,
        { userId, deviceId: await createDevice(userId), scopes: ['ballot'] },
        keyring,
      );
      await expect(rotateActionKeyIfDue(pool, issued.keyId, keyring)).resolves.toBeUndefined();
    });

    it('rotates a key inside the 7-day window: old key revoked, new key works', async () => {
      const userId = await createUser();
      const issued = await issueActionKey(
        pool,
        { userId, deviceId: await createDevice(userId), scopes: ['ballot'] },
        keyring,
      );
      await pool.query(
        "UPDATE device_action_keys SET expires_at = now() + interval '5 days' WHERE key_id = $1",
        [issued.keyId],
      );

      const rotated = await rotateActionKeyIfDue(pool, issued.keyId, keyring);
      expect(rotated).toBeDefined();
      expect(rotated?.keyId).not.toBe(issued.keyId);
      if (!rotated) throw new Error('expected a rotated key');

      const oldTs = String(Math.floor(Date.now() / 1000));
      const oldHeaders = signedHeaders(
        issued.secret,
        issued.keyId,
        'POST',
        '/v1/actions',
        '{}',
        oldTs,
      );
      await expect(
        verifyActionKeyRequest(
          { method: 'POST', path: '/v1/actions', headers: oldHeaders, body: '{}' },
          'ballot',
          { appPool: pool, keyring },
        ),
      ).rejects.toMatchObject({
        code: 'ACTION_KEY_SCOPE',
        detail: { reason: 'revoked_or_expired' },
      });

      const newTs = String(Math.floor(Date.now() / 1000));
      const newHeaders = signedHeaders(
        rotated.secret,
        rotated.keyId,
        'POST',
        '/v1/actions',
        '{}',
        newTs,
      );
      await expect(
        verifyActionKeyRequest(
          { method: 'POST', path: '/v1/actions', headers: newHeaders, body: '{}' },
          'ballot',
          { appPool: pool, keyring },
        ),
      ).resolves.toMatchObject({ keyId: rotated.keyId, userId });
    });
  });

  describe('bulk revocation', () => {
    it('revokeActionKeysForUser revokes every key for that user only', async () => {
      const userA = await createUser();
      const userB = await createUser();
      const keyA = await issueActionKey(
        pool,
        { userId: userA, deviceId: await createDevice(userA), scopes: ['ballot'] },
        keyring,
      );
      const keyB = await issueActionKey(
        pool,
        { userId: userB, deviceId: await createDevice(userB), scopes: ['ballot'] },
        keyring,
      );

      await revokeActionKeysForUser(pool, userA);

      const rows = await pool.query<{ key_id: string; revoked_at: Date | null }>(
        'SELECT key_id, revoked_at FROM device_action_keys WHERE key_id = ANY($1)',
        [[keyA.keyId, keyB.keyId]],
      );
      const byId = new Map(rows.rows.map((row) => [row.key_id, row.revoked_at]));
      expect(byId.get(keyA.keyId)).not.toBeNull();
      expect(byId.get(keyB.keyId)).toBeNull();
    });

    it('revokeActionKeysForDevice revokes every key for that device only', async () => {
      const userId = await createUser();
      const deviceX = await createDevice(userId);
      const deviceY = await createDevice(userId);
      const keyOnDeviceX = await issueActionKey(
        pool,
        { userId, deviceId: deviceX, scopes: ['ballot'] },
        keyring,
      );
      const keyOnDeviceY = await issueActionKey(
        pool,
        { userId, deviceId: deviceY, scopes: ['ballot'] },
        keyring,
      );

      await revokeActionKeysForDevice(pool, deviceX);

      const rows = await pool.query<{ key_id: string; revoked_at: Date | null }>(
        'SELECT key_id, revoked_at FROM device_action_keys WHERE key_id = ANY($1)',
        [[keyOnDeviceX.keyId, keyOnDeviceY.keyId]],
      );
      const byId = new Map(rows.rows.map((row) => [row.key_id, row.revoked_at]));
      expect(byId.get(keyOnDeviceX.keyId)).not.toBeNull();
      expect(byId.get(keyOnDeviceY.keyId)).toBeNull();
    });
  });
});
