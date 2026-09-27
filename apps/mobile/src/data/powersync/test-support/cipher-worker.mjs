// PowerSync's Node worker on SQLite3 Multiple Ciphers instead of plain better-sqlite3, so tests
// open the same SQLCipher 4 format encrypted file the app's op-sqlite + SQLCipher build writes.
// The key is applied as each connection opens: PowerSync runs its own statements before any
// `initializeConnection` hook, and on an existing encrypted file those would fail unkeyed.
import { workerData } from 'node:worker_threads';

import { startPowerSyncWorker } from '@powersync/node/worker.js';
import Database from 'better-sqlite3-multiple-ciphers';

const { key } = workerData;

function KeyedDatabase(path, options) {
  const db = new Database(path, options);
  db.pragma(`cipher = 'sqlcipher'`);
  db.pragma('legacy = 4');
  db.pragma(`key = '${String(key).replaceAll("'", "''")}'`);
  return db;
}

startPowerSyncWorker({ loadBetterSqlite3: async () => KeyedDatabase });
