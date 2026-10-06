import { describe, expect, it } from '@jest/globals';

import { ensureActionKey, type ActionKeyStorage, type StoredActionKey } from '../action-key';
import {
  androidActionKeyStorage,
  androidCapabilities,
  type AndroidSurfacesNative,
} from '../android-surfaces';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-07T00:00:00Z');

/** The Keystore: holds one key, never returns its secret. */
function keystore(path: 'promoted' | 'ongoing' | 'none' = 'promoted') {
  const state: { held: StoredActionKey | null; refuse: boolean } = { held: null, refuse: false };
  const native: AndroidSurfacesNative = {
    importActionKey: (json) => {
      if (state.refuse) return Promise.resolve(false);
      state.held = JSON.parse(json) as StoredActionKey;
      return Promise.resolve(true);
    },
    revokeActionKey: () => {
      state.held = null;
    },
    actionKeyInfo: () => (state.held === null ? null : { keyId: state.held.key_id }),
    permissionState: () => ({ liveUpdatePath: path }),
  };
  return { native, state };
}

function memory(): ActionKeyStorage & { value: string | null } {
  const store = {
    value: null as string | null,
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

function issuing(expiresInDays: number) {
  const calls: unknown[] = [];
  const http = (_path: string, init: { body?: string }) => {
    calls.push(JSON.parse(init.body ?? '{}'));
    return Promise.resolve({
      status: 201,
      json: () =>
        Promise.resolve({
          key_id: `key-${calls.length}`,
          secret: 'c2VjcmV0',
          scopes: ['polls'],
          expires_at: new Date(NOW + expiresInDays * DAY).toISOString(),
        }),
    });
  };
  return { http, calls };
}

const owner = { deviceId: 'device-1', userId: 'user-1', now: NOW };

describe('the action key on Android', () => {
  it('puts the secret in the Keystore and keeps none of it beside it', async () => {
    const { native, state } = keystore();
    const record = memory();
    const { http } = issuing(30);
    await ensureActionKey({ storage: androidActionKeyStorage(native, record), http, ...owner });
    expect(state.held?.secret).toBe('c2VjcmV0');
    expect(JSON.parse(record.value ?? '{}')).toMatchObject({ key_id: 'key-1', secret: '' });
  });

  it('asks for no new key while the Keystore still holds a fresh one', async () => {
    const { native } = keystore();
    const storage = androidActionKeyStorage(native, memory());
    const { http, calls } = issuing(30);
    await ensureActionKey({ storage, http, ...owner });
    await ensureActionKey({ storage, http, ...owner });
    expect(calls).toHaveLength(1);
  });

  it('issues again when the Keystore lost the key (restored backup, cleared credentials)', async () => {
    const { native, state } = keystore();
    const storage = androidActionKeyStorage(native, memory());
    const { http, calls } = issuing(30);
    await ensureActionKey({ storage, http, ...owner });
    state.held = null;
    await ensureActionKey({ storage, http, ...owner });
    expect(calls).toEqual([{}, {}]);
    expect(state.held).toMatchObject({ key_id: 'key-2' });
  });

  it('rotates a key with under a week left', async () => {
    const { native } = keystore();
    const storage = androidActionKeyStorage(native, memory());
    const { http, calls } = issuing(3);
    await ensureActionKey({ storage, http, ...owner });
    await ensureActionKey({ storage, http, ...owner });
    expect(calls).toEqual([{}, { rotate_key_id: 'key-1' }]);
  });

  it('keeps no record of a key the Keystore refused', async () => {
    const { native, state } = keystore();
    state.refuse = true;
    const record = memory();
    const { http } = issuing(30);
    await expect(
      ensureActionKey({ storage: androidActionKeyStorage(native, record), http, ...owner }),
    ).rejects.toThrow('action key import failed');
    expect(record.value).toBeNull();
  });

  it('revokes the Keystore key on sign-out', async () => {
    const { native, state } = keystore();
    const storage = androidActionKeyStorage(native, memory());
    const { http } = issuing(30);
    await ensureActionKey({ storage, http, ...owner });
    await storage.remove();
    expect(state.held).toBeNull();
    expect(await storage.read()).toBeNull();
  });
});

describe('what the phone tells the server about Live Updates', () => {
  it('can show one when promoted or as an ongoing notification', () => {
    expect(androidCapabilities(keystore('promoted').native)).toEqual({ live_updates: true });
    expect(androidCapabilities(keystore('ongoing').native)).toEqual({ live_updates: true });
  });

  it('cannot while notifications are off', () => {
    expect(androidCapabilities(keystore('none').native)).toEqual({ live_updates: false });
  });

  it('says nothing without the surfaces module', () => {
    expect(androidCapabilities(null)).toEqual({});
  });
});
