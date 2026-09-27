import { describe, expect, it } from '@jest/globals';

import {
  ActionKeyError,
  ensureActionKey,
  ROTATE_WHEN_REMAINING_MS,
  type ActionKeyHttp,
  type ActionKeyStorage,
  type StoredActionKey,
} from '../action-key';

const DEVICE = '0192f0c1-7a2b-7c3d-8e4f-a1b2c3d4e5f6';
const USER = '0192f0c1-0000-7000-8000-000000000001';
const NOW = Date.parse('2026-09-27T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function memoryStorage(initial?: StoredActionKey): ActionKeyStorage & { value: string | null } {
  const store = {
    value: initial ? JSON.stringify(initial) : null,
    read: () => Promise.resolve(store.value),
    write: (value: string) => {
      store.value = value;
      return Promise.resolve();
    },
    remove: () => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}

function stored(overrides: Partial<StoredActionKey> = {}): StoredActionKey {
  return {
    key_id: 'old',
    secret: 'old-secret',
    scopes: ['ballot'],
    expires_at: new Date(NOW + 20 * DAY).toISOString(),
    device_id: DEVICE,
    user_id: USER,
    ...overrides,
  };
}

function scriptedHttp(responses: { status: number; body?: unknown }[]) {
  const calls: { path: string; body: unknown }[] = [];
  const http: ActionKeyHttp = (path, init) => {
    calls.push({ path, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() ?? { status: 500 };
    return Promise.resolve({ status: next.status, json: () => Promise.resolve(next.body) });
  };
  return { http, calls };
}

const issued = (keyId: string) => ({
  status: 201,
  body: {
    key_id: keyId,
    secret: `${keyId}-secret`,
    scopes: ['ballot'],
    expires_at: new Date(NOW + 30 * DAY).toISOString(),
  },
});

describe('ensureActionKey', () => {
  it('issues and stores a key when there is none, tagged with its install and owner', async () => {
    const storage = memoryStorage();
    const { http, calls } = scriptedHttp([issued('k1')]);
    const key = await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW });
    expect(calls).toEqual([{ path: `/v1/devices/${DEVICE}/action-keys`, body: {} }]);
    expect(key).toMatchObject({ key_id: 'k1', device_id: DEVICE, user_id: USER });
    expect(JSON.parse(storage.value ?? '')).toEqual(key);
  });

  it('keeps a key with more than 7 days left without calling the api', async () => {
    const storage = memoryStorage(stored());
    const { http, calls } = scriptedHttp([]);
    expect(
      await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW }),
    ).toEqual(stored());
    expect(calls).toEqual([]);
  });

  it('rotates a key with under 7 days left', async () => {
    const expiring = stored({
      expires_at: new Date(NOW + ROTATE_WHEN_REMAINING_MS - 1).toISOString(),
    });
    const storage = memoryStorage(expiring);
    const { http, calls } = scriptedHttp([issued('k2')]);
    const key = await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW });
    expect(calls[0]?.body).toEqual({ rotate_key_id: 'old' });
    expect(key.key_id).toBe('k2');
  });

  it('keeps the current key when the server says rotation is not due yet', async () => {
    const expiring = stored({ expires_at: new Date(NOW + 6 * DAY).toISOString() });
    const storage = memoryStorage(expiring);
    const { http } = scriptedHttp([{ status: 409 }]);
    expect(
      (await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW })).key_id,
    ).toBe('old');
  });

  it('issues a fresh key when the server no longer knows the stored one', async () => {
    const storage = memoryStorage(stored({ expires_at: new Date(NOW + DAY).toISOString() }));
    const { http, calls } = scriptedHttp([{ status: 404 }, issued('k3')]);
    const key = await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW });
    expect(calls.map((call) => call.body)).toEqual([{ rotate_key_id: 'old' }, {}]);
    expect(key.key_id).toBe('k3');
  });

  it('replaces a key that belongs to another install or another user', async () => {
    for (const other of [{ device_id: 'elsewhere' }, { user_id: 'someone-else' }]) {
      const storage = memoryStorage(stored(other));
      const { http } = scriptedHttp([issued('k4')]);
      expect(
        (await ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW })).key_id,
      ).toBe('k4');
    }
  });

  it('surfaces an api failure and leaves the stored key untouched', async () => {
    const storage = memoryStorage();
    const { http } = scriptedHttp([{ status: 401 }]);
    await expect(
      ensureActionKey({ storage, http, deviceId: DEVICE, userId: USER, now: NOW }),
    ).rejects.toBeInstanceOf(ActionKeyError);
    expect(storage.value).toBeNull();
  });
});
