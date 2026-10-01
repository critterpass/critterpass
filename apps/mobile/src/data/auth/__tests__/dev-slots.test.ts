/**
 * Test accounts on one phone: keeping the organiser, starting a new account, keeping that one and
 * switching back signs the organiser's own session in again, and every switch runs the local
 * cleanup first so two accounts never share local data.
 */
import { describe, expect, it } from '@jest/globals';

import { createDevSlots, type KeyStore } from '../dev-slots';

function memoryStore(): KeyStore & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: (key) => Promise.resolve(map.get(key) ?? null),
    setItemAsync: (key, value) => {
      map.set(key, value);
      return Promise.resolve();
    },
    deleteItemAsync: (key) => {
      map.delete(key);
      return Promise.resolve();
    },
  };
}

describe('dev test accounts', () => {
  it('keeps, starts fresh, and restores the right account', async () => {
    const store = memoryStore();
    let cleanups = 0;
    const slots = createDevSlots(store, () => {
      cleanups += 1;
      return Promise.resolve();
    });
    store.map.set('better-auth_cookie', 'organiser-cookie');
    store.map.set('better-auth_session_data', 'organiser-session');

    await slots.keep('uid-organiser', 'Pat');
    await slots.switchTo(null);
    expect(store.map.get('better-auth_cookie')).toBeUndefined();

    store.map.set('better-auth_cookie', 'friend-cookie');
    await slots.keep('uid-friend', 'Rin');
    await slots.switchTo('uid-organiser');
    expect(store.map.get('better-auth_cookie')).toBe('organiser-cookie');
    expect(store.map.get('better-auth_session_data')).toBe('organiser-session');

    await slots.switchTo('uid-friend');
    expect(store.map.get('better-auth_cookie')).toBe('friend-cookie');
    expect(store.map.get('better-auth_session_data')).toBeUndefined();
    expect(cleanups).toBe(3);
    expect((await slots.list()).map((s) => s.uid)).toEqual(['uid-organiser', 'uid-friend']);
    // Keeping an account again leaves the order alone.
    await slots.keep('uid-organiser', 'Pat');
    expect((await slots.list()).map((s) => s.uid)).toEqual(['uid-organiser', 'uid-friend']);
  });

  it('refuses an unknown account before touching anything, and clears its slots', async () => {
    const store = memoryStore();
    const slots = createDevSlots(store, () => Promise.resolve());
    store.map.set('better-auth_cookie', 'live');
    await expect(slots.switchTo('nobody')).rejects.toThrow();
    expect(store.map.get('better-auth_cookie')).toBe('live');
    await slots.keep('uid-a', 'A');
    await slots.clear();
    expect(await slots.list()).toEqual([]);
    expect([...store.map.keys()]).toEqual(['better-auth_cookie']);
  });
});
