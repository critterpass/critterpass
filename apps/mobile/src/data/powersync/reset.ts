/**
 * Account switch handling (docs/data-model-sync-and-privacy.md §4; api-contracts §3
 * `SESSION_REVOKED` → clear local DB): whenever the device stops being the current uid — sign-out,
 * a merge into `existing_uid`, or a revoked session — every synced row, queued command, overlay and
 * `local_private` value of the old uid leaves the device before anything syncs for the next one.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { registerOnSignOut } from '../auth/sign-out-hooks';
import { OWNER_UID_KEY } from './local-tables';
import { noteSessionUid } from './session-uid-store';

export interface ResettableQueue {
  reset(): void;
}

/**
 * Stops the upload queue (so a late response cannot write into the next user's database),
 * disconnects sync and clears every table, local-only ones included; `local_private` is also wiped
 * explicitly so the owner's C3 values never outlive this call even if the clear is ever narrowed.
 */
export async function resetLocalData(
  db: AbstractPowerSyncDatabase,
  queue: ResettableQueue | null,
): Promise<void> {
  queue?.reset();
  await db.disconnectAndClear({ clearLocal: true });
  noteSessionUid(db, null);
  await db.execute('DELETE FROM local_private');
}

/**
 * Records which uid this database belongs to, first wiping it when it holds another uid's data —
 * covers a switch the sign-out hooks never saw (the app died between a merge and its hooks).
 */
export async function bindLocalOwner(
  db: AbstractPowerSyncDatabase,
  queue: ResettableQueue | null,
  uid: string,
): Promise<void> {
  const owner = await db.getOptional<{ value: string }>(
    'SELECT value FROM local_state WHERE id = ?',
    [OWNER_UID_KEY],
  );
  if (owner !== null && owner.value !== uid) await resetLocalData(db, queue);
  await db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    uid,
  ]);
  noteSessionUid(db, uid);
}

/** Wires `resetLocalData` into the auth layer's sign-out/merge hooks (runs once per install). */
export function registerLocalDataReset(
  target: () => { db: AbstractPowerSyncDatabase; queue: ResettableQueue | null } | null,
): void {
  registerOnSignOut(async () => {
    const current = target();
    if (current !== null) await resetLocalData(current.db, current.queue);
  });
}
