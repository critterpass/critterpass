/**
 * A complete local-first stack for hook and command tests: encrypted Node database, upload queue,
 * command client and an in-memory connectivity source — the same pieces db.ts assembles on device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- test support; literals are wire values. */
import { generateUuidV7, type CommandDevice } from '@cp/domain';
import { column, type AbstractPowerSyncDatabase } from '@powersync/common';
import { createElement, type ReactNode } from 'react';

import { createCommandClient } from '../../commands/client';
import { createNetworkState } from '../../status/network';
import { LocalFirstProvider, type LocalFirstContextValue } from '../local-first-context';
import { buildAppSchema } from '../schema';
import { overlayTable } from '../local-tables';
import { createFetchTransport, type SyncTransport } from '../transport';
import { createUploadQueue } from '../upload-queue';
import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  tempDatabaseDir,
} from './open-node-database';
import { nodeFetch } from './node-realm';
import { TEST_BACKOFF } from './queue-fixtures';

export const TEST_DEVICE: CommandDevice = {
  id: 'device-test',
  platform: 'ios',
  app_version: '1.0.0',
  tz: 'Asia/Ho_Chi_Minh',
};

/** `overlay_crews`: optimistic crews, as a feature would register with `registerOverlayTable`. */
export const OVERLAY_CREWS = 'overlay_crews';

export function testSchema() {
  return buildAppSchema(new Map([[OVERLAY_CREWS, overlayTable({ name: column.text })]]));
}

/** A real transport to a port nothing listens on (49): every request is refused. */
export const UNREACHABLE: SyncTransport = createFetchTransport({
  baseUrl: 'http://127.0.0.1:49',
  sessionHeaders: () => Promise.resolve({}),
  fetch: nodeFetch,
});

export interface TestLocalFirst {
  readonly value: LocalFirstContextValue;
  readonly db: AbstractPowerSyncDatabase;
  readonly network: ReturnType<typeof createNetworkState>;
  readonly dir: string;
  readonly key: string;
  readonly uid: string;
  readonly wrapper: (props: { children: ReactNode }) => ReactNode;
  close(): Promise<void>;
}

export async function openTestLocalFirst(
  options: {
    transport?: SyncTransport;
    dir?: string;
    key?: string;
    uid?: string;
    /** Sends never trigger an upload by themselves; the test flushes the queue when it wants. */
    holdUploads?: boolean;
  } = {},
): Promise<TestLocalFirst> {
  const dir = options.dir ?? tempDatabaseDir();
  const key = options.key ?? (await installKey(new MemoryKeyStore()));
  const uid = options.uid ?? generateUuidV7();
  const transport = options.transport ?? UNREACHABLE;
  const db = await openNodeDatabase({ dir, key, schema: testSchema() });
  const queue = createUploadQueue({
    db,
    transport,
    onSessionRevoked: () => Promise.resolve(),
    backoff: TEST_BACKOFF,
  });
  const network = createNetworkState(true);
  const commands = createCommandClient({
    db,
    queue: options.holdUploads === true ? { schedule: () => undefined } : queue,
    transport,
    uid: () => uid,
    device: () => Promise.resolve(TEST_DEVICE),
  });
  const value: LocalFirstContextValue = { db, queue, commands, network };
  return {
    value,
    db,
    network,
    dir,
    key,
    uid,
    wrapper: ({ children }) => createElement(LocalFirstProvider, { value }, children),
    async close() {
      queue.reset();
      await db.close();
    },
  };
}
