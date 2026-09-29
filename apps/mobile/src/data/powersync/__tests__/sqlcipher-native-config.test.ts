/**
 * SQLCipher is a native build flag. Android's op-sqlite reads it from this app's package.json, but
 * the iOS podspec resolves its own path inside the pnpm store and walks up to the workspace root's
 * package.json, so both must carry it: without the root copy, iOS links plain SQLite and the
 * encrypted open refuses to start the session.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

function opSqliteConfig(packageJson: string): unknown {
  return (JSON.parse(readFileSync(packageJson, 'utf8')) as Record<string, unknown>)['op-sqlite'];
}

const APP_ROOT = path.resolve(__dirname, '../../../..');

describe('op-sqlite native config', () => {
  it('turns SQLCipher on for both the Android and the iOS native builds', () => {
    const app = opSqliteConfig(path.join(APP_ROOT, 'package.json'));
    expect(app).toMatchObject({ sqlcipher: true });
    expect(opSqliteConfig(path.join(APP_ROOT, '../../package.json'))).toEqual(app);
  });
});
