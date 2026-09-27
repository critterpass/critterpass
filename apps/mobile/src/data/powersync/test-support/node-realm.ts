/**
 * PowerSync's Node SDK loaded through Node's own module loader rather than Jest's registry: the
 * SDK is ESM-only and resolves its SQLite worker and core extension via `import.meta.url`, which
 * Jest's CommonJS runtime cannot evaluate. Test files route `@powersync/common` here too
 * (`jest.mock('@powersync/common', () => require('.../node-realm').powersyncCommon)`), so the app
 * modules under test and the Node database share one copy of the SDK — the same code the React
 * Native SDK re-exports on device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type * as PowerSyncCommon from '@powersync/common';
import type * as PowerSyncNode from '@powersync/node';
import type BetterSqlite3 from 'better-sqlite3';
import type * as Vm from 'node:vm';
import type * as WorkerThreads from 'node:worker_threads';

const nodeRequire = process.getBuiltinModule('node:module').createRequire(__filename);

export const powersyncCommon = nodeRequire('@powersync/common') as typeof PowerSyncCommon;
export const powersyncNode = nodeRequire('@powersync/node') as typeof PowerSyncNode;
export const workerThreads = nodeRequire('node:worker_threads') as typeof WorkerThreads;

/**
 * Node's own fetch: under jest-expo the global `fetch` is Expo's native-backed implementation,
 * which has no native module in Jest. `runInThisContext` evaluates in Node's main context.
 */
export const nodeFetch = (nodeRequire('node:vm') as typeof Vm).runInThisContext(
  'fetch',
) as typeof fetch;

/** Plain better-sqlite3 (no cipher support) and the SQLite3 Multiple Ciphers fork. */
export const PlainSqlite = nodeRequire('better-sqlite3') as typeof BetterSqlite3;
export const CipherSqlite = nodeRequire('better-sqlite3-multiple-ciphers') as typeof BetterSqlite3;
