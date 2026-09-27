/**
 * Sync status for app chrome and the 3k-4 banner: `offline` (no network), `connecting` (network,
 * but the sync stream is not up yet or is reconnecting), `catching_up` (connected, still
 * downloading or never fully synced) and `online`; plus whether commands are uploading, when the
 * next upload retry is due, and when the last full sync finished.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a status discriminant, never copy. */
import type { AbstractPowerSyncDatabase, SyncStatus } from '@powersync/common';
import { useMemo, useSyncExternalStore } from 'react';

import { useLocalFirst } from '../powersync/local-first-context';
import type { UploadQueue, UploadQueueState } from '../powersync/upload-queue';
import type { NetworkSource } from './network';

export type SyncPhase = 'offline' | 'connecting' | 'catching_up' | 'online';

export interface SyncStatusView {
  readonly phase: SyncPhase;
  readonly uploading: boolean;
  readonly nextUploadRetryAt: number | null;
  readonly lastSyncedAt: Date | null;
}

export type SyncStatusInput = Pick<
  SyncStatus,
  'connected' | 'connecting' | 'hasSynced' | 'lastSyncedAt' | 'dataFlowStatus'
>;

export function deriveSyncStatus(
  sync: SyncStatusInput,
  networkOnline: boolean,
  queue: Pick<UploadQueueState, 'sending' | 'nextRetryAt'>,
): SyncStatusView {
  let phase: SyncPhase;
  if (!networkOnline) phase = 'offline';
  else if (!sync.connected) phase = 'connecting';
  else if (sync.dataFlowStatus.downloading || sync.hasSynced !== true) phase = 'catching_up';
  else phase = 'online';
  return {
    phase,
    uploading: queue.sending,
    nextUploadRetryAt: queue.nextRetryAt,
    lastSyncedAt: sync.lastSyncedAt ?? null,
  };
}

function sameView(a: SyncStatusView, b: SyncStatusView): boolean {
  return (
    a.phase === b.phase &&
    a.uploading === b.uploading &&
    a.nextUploadRetryAt === b.nextUploadRetryAt &&
    a.lastSyncedAt?.getTime() === b.lastSyncedAt?.getTime()
  );
}

/** An external store over PowerSync's status, the upload queue and connectivity. */
export function createSyncStatusStore(
  db: AbstractPowerSyncDatabase,
  queue: Pick<UploadQueue, 'getState' | 'subscribe'>,
  network: NetworkSource,
) {
  const compute = () => deriveSyncStatus(db.currentStatus, network.isOnline(), queue.getState());
  let snapshot = compute();
  return {
    getSnapshot: (): SyncStatusView => snapshot,
    subscribe: (listener: () => void): (() => void) => {
      const update = () => {
        const next = compute();
        if (sameView(next, snapshot)) return;
        snapshot = next;
        listener();
      };
      const stops = [
        db.registerListener({ statusChanged: update }),
        queue.subscribe(update),
        network.subscribe(update),
      ];
      update();
      return () => stops.forEach((stop) => stop());
    },
  };
}

export function useSyncStatus(): SyncStatusView {
  const { db, queue, network } = useLocalFirst();
  const store = useMemo(() => createSyncStatusStore(db, queue, network), [db, queue, network]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
