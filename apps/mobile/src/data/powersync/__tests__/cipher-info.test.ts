/**
 * The developer tools line that tells which cipher engine encrypts the local database. The Node
 * realm opens a real encrypted file with SQLite3 Multiple Ciphers, which is not SQLCipher and
 * answers neither pragma, so it must read as such rather than as a SQLCipher build.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { describeCipher, readDatabaseCipherInfo } from '../cipher-info';
import { openNodeDatabase, removeDir, tempDatabaseDir } from '../test-support/open-node-database';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../test-support/node-realm').powersyncCommon,
);

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) removeDir(dir);
});

describe('local database cipher info', () => {
  it('names the SQLCipher version and its crypto provider', () => {
    expect(describeCipher({ version: '4.19.0 community', provider: 'commoncrypto' })).toBe(
      'SQLCipher 4.19.0 community · commoncrypto',
    );
    expect(describeCipher({ version: '4.19.0', provider: null })).toBe(
      'SQLCipher 4.19.0 · unknown provider',
    );
  });

  it('reads a database that is not SQLCipher as such', async () => {
    const dir = tempDatabaseDir();
    dirs.push(dir);
    const db = await openNodeDatabase({ dir, key: 'a'.repeat(64) });
    try {
      const info = await readDatabaseCipherInfo(db);
      expect(info).toEqual({ version: null, provider: null });
      expect(describeCipher(info)).toBe('not SQLCipher');
    } finally {
      await db.close();
    }
  });
});
