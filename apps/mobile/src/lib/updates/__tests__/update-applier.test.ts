import { describe, expect, it } from '@jest/globals';
import { createMMKV } from 'react-native-mmkv';

import { createUpdateApplier, LAUNCH_WINDOW_MS, type UpdateApplierDeps } from '../update-applier';

const KEY = 'cp.updates.reloaded_for';
const UPDATE = '0199b0c1-5a00-7d21-9c1e-2b7f4a6d8e90';
const NEXT_UPDATE = '0199b0f4-11c2-7a05-b3d8-6e9a1c2f4b77';

/** A phone some time into a session, with nothing downloaded yet. */
function phone(overrides: Partial<UpdateApplierDeps> = {}) {
  const storage = createMMKV();
  const state = { now: 60_000, busy: false, reloads: 0, carried: [] as string[] };
  const applier = createUpdateApplier({
    available: true,
    isBusy: () => state.busy,
    reloadedFor: {
      read: () => storage.getString(KEY) ?? null,
      write: (updateId) => storage.set(KEY, updateId),
    },
    carryNavigation: (updateId) => state.carried.push(updateId),
    reload: () => {
      state.reloads += 1;
      return Promise.resolve();
    },
    now: () => state.now,
    startedAt: 0,
    ...overrides,
  });
  return { applier, state, storage };
}

describe('update applier', () => {
  it('restarts once when the app comes back to the front with an update downloaded', () => {
    const { applier, state } = phone();
    // Downloaded mid-session: nothing happens under the person's hands.
    expect(applier.downloaded(UPDATE)).toBe(false);
    expect(state.reloads).toBe(0);

    expect(applier.returnedToForeground()).toBe(true);
    expect(state.reloads).toBe(1);
  });

  it('waits while the person is typing or has a sheet up, and restarts at the next return', () => {
    const { applier, state } = phone();
    applier.downloaded(UPDATE);
    state.busy = true;
    expect(applier.returnedToForeground()).toBe(false);
    expect(state.reloads).toBe(0);

    state.busy = false;
    expect(applier.returnedToForeground()).toBe(true);
    expect(state.reloads).toBe(1);
  });

  it('never restarts twice for the same update, across runtimes too', () => {
    const first = phone();
    first.applier.downloaded(UPDATE);
    first.applier.returnedToForeground();
    expect(first.applier.returnedToForeground()).toBe(false);
    expect(first.state.reloads).toBe(1);

    // The update failed to start and is offered again by the next runtime: the id is remembered.
    const second = createUpdateApplier({
      available: true,
      isBusy: () => false,
      reloadedFor: { read: () => first.storage.getString(KEY) ?? null, write: () => undefined },
      carryNavigation: () => undefined,
      reload: () => Promise.reject(new Error('must not restart')),
      now: () => 1000,
      startedAt: 0,
    });
    expect(second.downloaded(UPDATE)).toBe(false);
    expect(second.returnedToForeground()).toBe(false);
  });

  it('writes the update down before restarting, and restarts again for a newer one', () => {
    const storedAtRestart: (string | undefined)[] = [];
    const { applier, storage } = phone({
      reload: () => {
        storedAtRestart.push(storage.getString(KEY));
        return Promise.resolve();
      },
    });
    applier.downloaded(UPDATE);
    expect(applier.returnedToForeground()).toBe(true);
    applier.downloaded(NEXT_UPDATE);
    expect(applier.returnedToForeground()).toBe(true);
    expect(storedAtRestart).toEqual([UPDATE, NEXT_UPDATE]);
  });

  it('carries the screen the person is on to the update before restarting, and only then', () => {
    const { applier, state } = phone();
    applier.downloaded(UPDATE);
    expect(state.carried).toEqual([]);
    applier.returnedToForeground();
    expect(state.carried).toEqual([UPDATE]);
    expect(state.reloads).toBe(1);
  });

  it('never restarts on a production build', () => {
    const { applier, state } = phone({ available: false });
    state.now = 1000;
    expect(applier.downloaded(UPDATE)).toBe(false);
    expect(applier.returnedToForeground()).toBe(false);
    expect(state.reloads).toBe(0);
  });

  it('does nothing when no update is waiting', () => {
    const { applier, state } = phone();
    expect(applier.returnedToForeground()).toBe(false);
    applier.downloaded(UPDATE);
    applier.downloaded(null);
    expect(applier.returnedToForeground()).toBe(false);
    expect(state.reloads).toBe(0);
  });

  describe('right after launch', () => {
    it('restarts when the download finishes within the first seconds', () => {
      const { applier, state } = phone();
      state.now = LAUNCH_WINDOW_MS;
      expect(applier.downloaded(UPDATE)).toBe(true);
      expect(state.reloads).toBe(1);
    });

    it('leaves a person who already went somewhere where they are', () => {
      const { applier, state } = phone();
      state.now = 2000;
      applier.moved();
      expect(applier.downloaded(UPDATE)).toBe(false);
      expect(state.reloads).toBe(0);
    });

    it('waits when the person is already typing', () => {
      const { applier, state } = phone();
      state.now = 2000;
      state.busy = true;
      expect(applier.downloaded(UPDATE)).toBe(false);
      expect(state.reloads).toBe(0);
    });

    it('does not restart once the first seconds have passed', () => {
      const { applier, state } = phone();
      state.now = LAUNCH_WINDOW_MS + 1;
      expect(applier.downloaded(UPDATE)).toBe(false);
      expect(state.reloads).toBe(0);
    });
  });

  it('stays quiet when the restart itself fails: the update waits for the next cold start', async () => {
    const { applier } = phone({ reload: () => Promise.reject(new Error('updates disabled')) });
    applier.downloaded(UPDATE);
    expect(applier.returnedToForeground()).toBe(true);
    await Promise.resolve();
    expect(applier.returnedToForeground()).toBe(false);
  });
});
