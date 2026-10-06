/**
 * Which rejected writes were made with no signal. A rejection only reaches the phone after it is
 * back online, often after the offline card has lifted or the app was reopened, so every write
 * that waited with no signal is remembered on the phone until it went through or the traveller
 * has read why it did not.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { dismissRejected } from '@/data/status/use-rejected-commands';

const KIND = 'offline_send';

export const OFFLINE_SENDS_SQL = 'SELECT id FROM local_private WHERE kind = ?';
export const OFFLINE_SENDS_PARAMS = [KIND] as const;
export const OFFLINE_SENDS_TABLES = ['local_private'] as const;

/** Remembers the writes waiting while there is no signal. */
export async function rememberOfflineSends(
  db: AbstractPowerSyncDatabase,
  opIds: readonly string[],
): Promise<void> {
  if (opIds.length === 0) return;
  const at = new Date().toISOString();
  await db.writeTransaction(async (tx) => {
    for (const opId of opIds) {
      await tx.execute(
        `INSERT INTO local_private (id, kind, data, fetched_at)
         SELECT ?, ?, '{}', ? WHERE NOT EXISTS (SELECT 1 FROM local_private WHERE id = ?)`,
        [opId, KIND, at, opId],
      );
    }
  });
}

/** Forgets the ones that went through or were cancelled: neither waiting nor rejected. */
export async function forgetSettledOfflineSends(db: AbstractPowerSyncDatabase): Promise<void> {
  await db.execute(
    `DELETE FROM local_private
      WHERE kind = ?
        AND id NOT IN (SELECT id FROM commands)
        AND id NOT IN (SELECT id FROM rejected_commands)`,
    [KIND],
  );
}

/** The traveller has read it: the rejection and its mark both go. */
export async function dismissOfflineConflict(
  db: AbstractPowerSyncDatabase,
  opId: string,
): Promise<void> {
  await dismissRejected(db, opId);
  await db.execute('DELETE FROM local_private WHERE kind = ? AND id = ?', [KIND, opId]);
}

/** The rejected writes that were made with no signal, in the order given. */
export function offlineConflicts<T extends { readonly opId: string }>(
  rejected: readonly T[],
  offlineSends: readonly { readonly id: string }[],
): T[] {
  const marked = new Set(offlineSends.map((row) => row.id));
  return rejected.filter((item) => marked.has(item.opId));
}

export type OfflineSurface = 'full' | 'conflicts' | 'none';

/**
 * What the trip hub shows: the whole offline state while there is no signal, through the
 * reconnect and the "Back online" hold; after that only what did not go through, for as long as
 * any of it is unread; otherwise nothing.
 */
export function offlineSurface(input: {
  readonly phase: 'online' | 'offline' | 'reconnecting' | 'back';
  readonly lifted: boolean;
  readonly conflicts: number;
}): OfflineSurface {
  if (input.phase === 'offline' || input.phase === 'reconnecting' || !input.lifted) return 'full';
  return input.conflicts > 0 ? 'conflicts' : 'none';
}
