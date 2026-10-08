/**
 * Sync status transitions: the pure derivation across every phase, and the live store over a real
 * PowerSync database, upload queue and connectivity source — including a real connection attempt
 * to a sync endpoint that refuses it.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import type { SyncStatus } from '@powersync/common';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { createSyncConnector } from '../../powersync/connector';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { enqueue, eventually } from '../../powersync/test-support/queue-fixtures';
import {
  createSyncStatusStore,
  deriveSyncStatus,
  useSyncPhase,
  useSyncStatus,
  type SyncStatusInput,
} from '../use-sync-status';

function sync(overrides: Partial<SyncStatusInput> & { downloading?: boolean }): SyncStatusInput {
  const { downloading = false, ...rest } = overrides;
  return {
    connected: false,
    connecting: false,
    hasSynced: undefined,
    lastSyncedAt: undefined,
    dataFlowStatus: { downloading, uploading: false },
    ...rest,
  };
}

const idleQueue = { sending: false, nextRetryAt: null };

describe('deriveSyncStatus', () => {
  it('walks offline → connecting → catching up → online and back', () => {
    const syncedAt = new Date('2026-09-27T10:00:00Z');
    const steps = [
      deriveSyncStatus(sync({}), false, idleQueue),
      deriveSyncStatus(sync({ connecting: true }), true, idleQueue),
      deriveSyncStatus(sync({ connected: true, downloading: true }), true, idleQueue),
      deriveSyncStatus(
        sync({ connected: true, hasSynced: true, lastSyncedAt: syncedAt }),
        true,
        idleQueue,
      ),
      deriveSyncStatus(
        sync({ connected: true, hasSynced: true, lastSyncedAt: syncedAt }),
        false,
        idleQueue,
      ),
    ];
    expect(steps.map((s) => s.phase)).toEqual([
      'offline',
      'connecting',
      'catching_up',
      'online',
      'offline',
    ]);
    expect(steps[3]!.lastSyncedAt).toEqual(syncedAt);
    expect(steps[4]!.lastSyncedAt).toEqual(syncedAt);
  });

  it('is catching up while connected but never fully synced, and connecting while reconnecting', () => {
    expect(deriveSyncStatus(sync({ connected: true }), true, idleQueue).phase).toBe('catching_up');
    expect(deriveSyncStatus(sync({ hasSynced: true }), true, idleQueue).phase).toBe('connecting');
  });

  it('reports uploads and the next upload retry independently of the phase', () => {
    const view = deriveSyncStatus(sync({}), false, { sending: true, nextRetryAt: 1234 });
    expect(view).toMatchObject({ phase: 'offline', uploading: true, nextUploadRetryAt: 1234 });
  });
});

describe('sync status store', () => {
  let stack: TestLocalFirst;

  afterEach(async () => {
    await stack.value.db.disconnect();
    await stack.close();
    removeDir(stack.dir);
  });

  it('follows connectivity, uploads and a refused sync connection', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const store = createSyncStatusStore(stack.db, stack.value.queue, stack.network);
    const phases: string[] = [];
    const stop = store.subscribe(() => {
      const { phase } = store.getSnapshot();
      if (phases.at(-1) !== phase) phases.push(phase);
    });
    expect(store.getSnapshot()).toMatchObject({ phase: 'connecting', uploading: false });

    stack.network.set(false);
    expect(store.getSnapshot().phase).toBe('offline');
    stack.network.set(true);
    expect(store.getSnapshot().phase).toBe('connecting');

    await enqueue(stack.db, stack.uid, 'create_test_crew', {});
    await stack.value.queue.flush();
    expect(store.getSnapshot().nextUploadRetryAt).not.toBeNull();

    await stack.db.connect(
      createSyncConnector({
        endpoint: 'http://127.0.0.1:49',
        getSyncToken: () => Promise.resolve('token'),
        flushCommands: () => Promise.resolve(),
      }),
    );
    await eventually(() =>
      Promise.resolve(stack.db.currentStatus.dataFlowStatus.downloadError !== undefined),
    );
    expect(store.getSnapshot().phase).toBe('connecting');
    expect(phases).toEqual(['offline', 'connecting']);
    stop();
  });

  it('drives useSyncStatus', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const { result } = await renderHook(() => useSyncStatus(), { wrapper: stack.wrapper });
    expect(result.current.phase).toBe('connecting');

    await act(() => stack.network.set(false));
    await waitFor(() => expect(result.current.phase).toBe('offline'));
    await act(() => stack.network.set(true));
    await waitFor(() => expect(result.current.phase).toBe('connecting'));
  });

  it('does not re-render a phase reader for an upload or a checkpoint that keeps the phase', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const full = await renderHook(() => useSyncStatus(), { wrapper: stack.wrapper });
    let phaseRenders = 0;
    const phase = await renderHook(
      () => {
        phaseRenders += 1;
        return useSyncPhase();
      },
      { wrapper: stack.wrapper },
    );
    expect(phase.result.current).toBe('connecting');
    const whileConnecting = phaseRenders;

    // An upload attempt: `uploading` flips and a retry is scheduled; the phase stays.
    await enqueue(stack.db, stack.uid, 'create_test_crew', {});
    await act(() => stack.value.queue.flush());
    await waitFor(() => expect(full.result.current.nextUploadRetryAt).not.toBeNull());
    expect(phaseRenders).toBe(whileConnecting);

    // The sync stream reports as it does on a device: connected and synced, then a later
    // checkpoint that only moves the last sync time. No sync service runs here, so the test hands
    // the report to the database's status listeners itself (a channel its public type leaves out).
    const statusChannel = stack.db as unknown as {
      iterateListeners(
        report: (listener: { statusChanged?: (status: SyncStatus) => void }) => void,
      ): void;
    };
    const report = async (lastSyncedAt: Date) => {
      const status = {
        connected: true,
        connecting: false,
        hasSynced: true,
        lastSyncedAt,
        dataFlowStatus: { downloading: false, uploading: false },
      } as SyncStatus;
      await act(() => {
        Object.assign(stack.db, { currentStatus: status });
        statusChannel.iterateListeners((listener) => listener.statusChanged?.(status));
      });
    };
    await report(new Date('2026-09-27T10:00:00Z'));
    await waitFor(() => expect(phase.result.current).toBe('online'));
    const whileOnline = phaseRenders;
    expect(whileOnline).toBe(whileConnecting + 1);

    await report(new Date('2026-09-27T10:00:30Z'));
    await waitFor(() =>
      expect(full.result.current.lastSyncedAt).toEqual(new Date('2026-09-27T10:00:30Z')),
    );
    expect(phase.result.current).toBe('online');
    expect(phaseRenders).toBe(whileOnline);

    await full.unmount();
    await phase.unmount();
  });
});
