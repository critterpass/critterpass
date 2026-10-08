/**
 * Whose data a local database holds, known without a read: the session tells this store the moment
 * it binds a database to a uid or wipes it (`reset.ts`), so a screen has the signed-in uid on its
 * first render. While something is subscribed the store also follows the owner row itself, which
 * covers a database bound before this process started reading it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { OWNER_UID_KEY } from './local-tables';

const OWNER_SQL = 'SELECT value FROM local_state WHERE id = ?';

interface OwnerStore {
  uid: string | null;
  readonly listeners: Set<() => void>;
  stop: (() => void) | null;
  /** Owner-row reads started, and the newest one this store has taken (or passed over). */
  started: number;
  settled: number;
}

const stores = new WeakMap<AbstractPowerSyncDatabase, OwnerStore>();

function storeFor(db: AbstractPowerSyncDatabase): OwnerStore {
  let store = stores.get(db);
  if (store === undefined) {
    store = { uid: null, listeners: new Set(), stop: null, started: 0, settled: 0 };
    stores.set(db, store);
  }
  return store;
}

function set(store: OwnerStore, uid: string | null): void {
  if (store.uid === uid) return;
  store.uid = uid;
  store.listeners.forEach((listener) => listener());
}

/** The session bound `db` to `uid`, or wiped it (`null`). Reads still in flight predate this. */
export function noteSessionUid(db: AbstractPowerSyncDatabase, uid: string | null): void {
  const store = storeFor(db);
  store.settled = store.started;
  set(store, uid);
}

/** The uid `db` is bound to, as far as this process knows; `null` when it holds nobody's data. */
export function sessionUid(db: AbstractPowerSyncDatabase): string | null {
  return storeFor(db).uid;
}

function followOwnerRow(db: AbstractPowerSyncDatabase, store: OwnerStore): () => void {
  const controller = new AbortController();
  const read = (): Promise<void> => {
    store.started += 1;
    const mine = store.started;
    return db.getOptional<{ value: string | null }>(OWNER_SQL, [OWNER_UID_KEY]).then(
      (row) => {
        if (controller.signal.aborted || mine <= store.settled) return;
        store.settled = mine;
        set(store, row?.value ?? null);
      },
      () => undefined,
    );
  };
  void read();
  db.onChange(
    { onChange: () => read() },
    { tables: ['local_state'], throttleMs: 30, signal: controller.signal },
  );
  return () => controller.abort();
}

export function subscribeSessionUid(
  db: AbstractPowerSyncDatabase,
  listener: () => void,
): () => void {
  const store = storeFor(db);
  store.listeners.add(listener);
  store.stop ??= followOwnerRow(db, store);
  return () => {
    store.listeners.delete(listener);
    if (store.listeners.size > 0) return;
    store.stop?.();
    store.stop = null;
  };
}
