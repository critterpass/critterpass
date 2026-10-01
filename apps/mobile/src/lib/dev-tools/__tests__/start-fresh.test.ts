import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { createMMKV, type MMKV } from 'react-native-mmkv';

import {
  FILE_TARGETS,
  MMKV_STORES,
  SECURE_ITEMS,
  startFresh,
  type StartFreshPorts,
} from '../start-fresh';

/** The install's id and the item earlier builds kept a second id in. */
const INSTALL_ID_ITEMS = ['cp.install_id', 'cp.device.id'];

const SRC = join(__dirname, '..', '..', '..');

/** A port that does `effect` and reports it done. */
const done = (effect: () => unknown): Promise<void> => {
  effect();
  return Promise.resolve();
};

/** A phone with something in every store an account writes to. */
function usedPhone(overrides: Partial<StartFreshPorts> = {}) {
  const stores = new Map<string | null, MMKV>();
  const store = (id: string | null) => {
    const open = stores.get(id) ?? (id === null ? createMMKV() : createMMKV({ id }));
    stores.set(id, open);
    return open;
  };
  for (const { id } of MMKV_STORES) store(id).set('some.key', 'old account');
  store('cp-links').set('cp.links.deferred_checked', true);
  store('cp-links').set('cp.links.onboarded', true);
  store('cp-live-activities').set('la.start.trip_day', 'push-to-start-token');

  const secure = new Set([...SECURE_ITEMS.map((item) => item.key), ...INSTALL_ID_ITEMS]);
  const files = new Set(FILE_TARGETS.map((target) => `${target.root}/${target.name}`));
  const calls: string[] = [];
  const ports: StartFreshPorts = {
    eraseAccount: () => Promise.resolve('erased'),
    signOut: (onServer) => done(() => calls.push(onServer ? 'signOut on server' : 'signOut')),
    forgetSessions: () => done(() => calls.push('forgetSessions')),
    forgetInstallId: () => done(() => INSTALL_ID_ITEMS.forEach((key) => secure.delete(key))),
    deleteSecureItem: (item) => done(() => secure.delete(item.key)),
    cancelNotificationsAndAlarms: () => done(() => calls.push('cancelNotificationsAndAlarms')),
    deleteFiles: (target) => done(() => files.delete(`${target.root}/${target.name}`)),
    openStore: store,
    reload: () => done(() => calls.push('reload')),
    ...overrides,
  };
  return { ports, store, secure, files, calls };
}

const ASKING = { leaveAccountOnServer: false };
const AGREED = { leaveAccountOnServer: true };

function expectUntouched(phone: ReturnType<typeof usedPhone>) {
  expect(phone.calls).toEqual([]);
  expect(phone.secure.has('cp.install_id')).toBe(true);
  expect(phone.files.has('document/media')).toBe(true);
  expect(phone.store('cp-onboarding').getString('some.key')).toBe('old account');
}

describe('startFresh', () => {
  it('clears what the account left on the phone and restarts', async () => {
    const phone = usedPhone();
    expect(await startFresh(phone.ports, AGREED)).toEqual({ kind: 'restarting' });

    expect(phone.calls).toEqual([
      'signOut',
      'forgetSessions',
      'cancelNotificationsAndAlarms',
      'reload',
    ]);
    for (const id of [null, 'cp-app-session', 'cp-onboarding', 'cp-permissions', 'cp-realtime']) {
      expect(phone.store(id).getAllKeys()).toEqual([]);
    }
    expect([...phone.secure]).toEqual(['cp.local-db.key']);
    expect([...phone.files].sort()).toEqual(['document/cp-regions', 'document/phrase_audio']);
  });

  it('keeps the Live Activity tokens and the once-per-install link check', async () => {
    const phone = usedPhone();
    await startFresh(phone.ports, ASKING);

    const liveActivities = phone.store('cp-live-activities');
    expect(liveActivities.getString('la.start.trip_day')).toBe('push-to-start-token');
    expect(liveActivities.getAllKeys().sort()).toEqual(['la.start.trip_day', 'some.key']);
    expect(phone.store('cp-links').getAllKeys()).toEqual(['cp.links.deferred_checked']);
  });

  it('touches nothing on the phone when the server refuses to erase the account', async () => {
    const phone = usedPhone({ eraseAccount: () => Promise.reject(new Error('FORBIDDEN')) });
    expect(await startFresh(phone.ports, AGREED)).toEqual({
      kind: 'server_failed',
      message: 'FORBIDDEN',
    });
    expectUntouched(phone);
  });

  it.each(['unavailable', 'signed_out'] as const)(
    'touches nothing while the account would stay on the server (%s) and nobody agreed',
    async (outcome) => {
      const phone = usedPhone({ eraseAccount: () => Promise.resolve(outcome) });
      expect(await startFresh(phone.ports, ASKING)).toEqual({
        kind: 'account_would_stay',
        why: outcome,
      });
      expectUntouched(phone);
    },
  );

  it('goes on as a new identity once the person agreed to leave the account behind', async () => {
    const phone = usedPhone({ eraseAccount: () => Promise.resolve('unavailable') });
    expect(await startFresh(phone.ports, AGREED)).toEqual({ kind: 'restarting' });
    // The session is still live on the server, so it is signed out there too.
    expect(phone.calls[0]).toBe('signOut on server');
    expect(phone.secure.has('cp.install_id')).toBe(false);
  });

  it('erases the account first and makes no call on its ended session afterwards', async () => {
    const order: string[] = [];
    const phone = usedPhone({
      eraseAccount: () => {
        order.push('erase');
        return Promise.resolve('erased');
      },
      signOut: (onServer) => done(() => order.push(onServer ? 'signOut on server' : 'signOut')),
    });
    expect(await startFresh(phone.ports, ASKING)).toEqual({ kind: 'restarting' });
    expect(order).toEqual(['erase', 'signOut']);
  });

  it('says so when the phone is cleared but the app would not restart', async () => {
    const phone = usedPhone({ reload: () => Promise.reject(new Error('updates are disabled')) });
    expect(await startFresh(phone.ports, ASKING)).toEqual({
      kind: 'restart_failed',
      message: 'updates are disabled',
    });
    expect(phone.store('cp-onboarding').getAllKeys()).toEqual([]);
  });

  it('clears everything else, reports what failed and does not restart half-wiped', async () => {
    const phone = usedPhone({
      cancelNotificationsAndAlarms: () => Promise.reject(new Error('no module')),
    });
    expect(await startFresh(phone.ports, ASKING)).toEqual({
      kind: 'incomplete',
      failed: ['notifications and alarms: no module'],
    });
    expect(phone.calls).not.toContain('reload');
    expect(phone.store('cp-onboarding').getAllKeys()).toEqual([]);
    expect(phone.secure.has('cp.install_id')).toBe(false);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [path] : [];
  });
}

describe('the list of MMKV stores', () => {
  it('names every store the app opens, so a new store must decide: cleared or kept', () => {
    const opened = new Set<string>();
    // The Start fresh screen opens the stores this list names; it adds none of its own.
    const wipe = join('(dev)', 'start-fresh.tsx');
    for (const file of sourceFiles(SRC).filter((path) => !path.endsWith(wipe))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/createMMKV\(\s*\{\s*id(?::\s*([^}\s]+))?\s*\}\s*\)/gu)) {
        // `{ id: 'literal' }`, `{ id: CONSTANT }` or the shorthand `{ id }`.
        const value = match[1] ?? 'id';
        const literal = /^'([^']+)'$/u.exec(value);
        if (literal?.[1] !== undefined) opened.add(literal[1]);
        else {
          // An id held in a constant or a default: its literal is in the same file.
          const name = value.replace(/[^A-Za-z0-9_]/gu, '');
          const constant = new RegExp(`${name}\\s*=\\s*'([^']+)'`, 'u').exec(source);
          opened.add(constant?.[1] ?? `unresolved id in ${file}`);
        }
      }
    }
    const listed = MMKV_STORES.flatMap((store) => (store.id === null ? [] : [store.id]));
    expect([...opened].sort()).toEqual([...listed].sort());
  });
});
