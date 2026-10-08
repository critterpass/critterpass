/**
 * The local database is unreadable without the install's key. Proven on a real SQLCipher-format
 * file: @powersync/node over SQLite3 Multiple Ciphers in SQLCipher 4 mode, keyed by the app's own
 * key-management code (encryption-key.ts), then reopened raw with plain SQLite and a wrong key.
 */
import path from 'node:path';

import { afterEach, describe, expect, it } from '@jest/globals';

import { DATABASE_KEY_BYTES, DATABASE_KEY_ITEM, loadOrCreateDatabaseKey } from '../encryption-key';
import { insertQueuedCommand } from '../queue-store';
import { CipherSqlite, PlainSqlite } from '../test-support/node-realm';
import {
  AFTER_FIRST_UNLOCK,
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
  TEST_DB_FILENAME,
} from '../test-support/open-node-database';

const dirs: string[] = [];
function freshDir(): string {
  const dir = tempDatabaseDir();
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir);
});

const SECRET = 'insurance policy 4471-XK';

async function writeSecret(dir: string, key: string): Promise<void> {
  const db = await openNodeDatabase({ dir, key });
  await db.writeTransaction((tx) =>
    insertQueuedCommand(tx, {
      opId: '0190f5a4-0000-7000-8000-000000000001',
      cmd: 'save_private_note',
      envelope: { payload: { note: SECRET } },
      summary: null,
      createdAt: new Date().toISOString(),
    }),
  );
  await db.execute('INSERT INTO local_private (id, kind, data) VALUES (uuid(), ?, ?)', [
    'insurance',
    SECRET,
  ]);
  await db.close();
}

describe('database key management', () => {
  it('creates a 32-byte hex key once, readable after first unlock and never behind biometrics', async () => {
    const store = new MemoryKeyStore();
    const first = await installKey(store);
    const second = await installKey(store);

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first.length / 2).toBe(DATABASE_KEY_BYTES);
    expect(second).toBe(first);
    expect(store.items.get(DATABASE_KEY_ITEM)).toBe(first);
    for (const options of store.options) {
      expect(options).toEqual({
        requireAuthentication: false,
        keychainAccessible: AFTER_FIRST_UNLOCK,
      });
    }
  });

  it('replaces a stored value that is not a full key', async () => {
    const store = new MemoryKeyStore();
    store.items.set(DATABASE_KEY_ITEM, 'abc');
    const key = await installKey(store);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a random source that returns the wrong number of bytes', async () => {
    await expect(
      loadOrCreateDatabaseKey(new MemoryKeyStore(), () => new Uint8Array(8), AFTER_FIRST_UNLOCK),
    ).rejects.toThrow('expected 32');
  });
});

describe('encrypted local database', () => {
  it('cannot be read as SQLite without the key, nor with a wrong key', async () => {
    const dir = freshDir();
    const key = await installKey(new MemoryKeyStore());
    await writeSecret(dir, key);
    const file = path.join(dir, TEST_DB_FILENAME);

    const plain = new PlainSqlite(file);
    expect(() => plain.prepare('SELECT count(*) FROM sqlite_master').get()).toThrow(
      /not a database/,
    );
    plain.close();

    const wrong = new CipherSqlite(file);
    wrong.pragma(`cipher = 'sqlcipher'`);
    wrong.pragma('legacy = 4');
    wrong.pragma(`key = '${'0'.repeat(64)}'`);
    expect(() => wrong.prepare('SELECT count(*) FROM sqlite_master').get()).toThrow(
      /not a database/,
    );
    wrong.close();

    const right = await openNodeDatabase({ dir, key });
    const rows = await right.getAll<{ data: string }>('SELECT data FROM local_private');
    expect(rows).toEqual([{ data: SECRET }]);
    await right.close();
  });

  it('refuses to open a database without a cipher', async () => {
    await expect(openNodeDatabase({ dir: freshDir(), key: null })).rejects.toThrow(
      'opened without encryption',
    );
  });

  it('recreates an empty database when the stored key cannot decrypt the file', async () => {
    const dir = freshDir();
    await writeSecret(dir, await installKey(new MemoryKeyStore()));

    const otherKey = await installKey(new MemoryKeyStore());
    const db = await openNodeDatabase({ dir, key: otherKey });
    expect(await db.getAll('SELECT * FROM local_private')).toEqual([]);
    expect(await db.getAll('SELECT * FROM commands')).toEqual([]);
    await db.close();
  });
});
