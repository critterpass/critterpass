/**
 * SQLCipher is a native build flag. Android's op-sqlite reads it from this app's package.json, but
 * the iOS podspec resolves its own path inside the pnpm store and walks up to the workspace root's
 * package.json, so both must carry it: without the root copy, iOS links plain SQLite and the
 * encrypted open refuses to start the session.
 *
 * On iOS SQLCipher must run on CommonCrypto rather than a bundled OpenSSL: the app config declares
 * that it uses only the OS's own encryption, which is what spares every TestFlight build the export
 * compliance question. A bundled crypto library would make that declaration false.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { describe, expect, it, jest } from '@jest/globals';

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

describe('iOS SQLCipher crypto provider', () => {
  const podspec = readFileSync(
    path.join(
      path.dirname(
        require.resolve('@op-engineering/op-sqlite/package.json', { paths: [APP_ROOT] }),
      ),
      'op-sqlite.podspec',
    ),
    'utf8',
  );

  it('builds SQLCipher on CommonCrypto without bundling OpenSSL', () => {
    expect(podspec).toMatch(/GCC_PREPROCESSOR_DEFINITIONS\] \+= "[^"]*SQLCIPHER_CRYPTO_CC/);
    expect(podspec).toMatch(/s\.frameworks = \["Security", "CoreFoundation"\]/);
    expect(podspec).not.toContain('OpenSSL-Universal');
    // Xcode's clang modules would otherwise re-enable SQLite's asserts through CoreFoundation.
    expect(podspec).toContain('xcconfig[:CLANG_ENABLE_MODULES] = "NO"');
  });

  it.each(['development', 'staging', 'production'])(
    'declares no non-exempt encryption in the %s app config',
    (variant) => {
      const previous = process.env.APP_VARIANT;
      process.env.APP_VARIANT = variant;
      try {
        let resolve: ((context: ConfigContext) => ExpoConfig) | undefined;
        jest.isolateModules(() => {
          resolve = jest.requireActual<{ default: (context: ConfigContext) => ExpoConfig }>(
            path.join(APP_ROOT, 'app.config.ts'),
          ).default;
        });
        const config = resolve?.({
          config: {},
          projectRoot: APP_ROOT,
          staticConfigPath: null,
          packageJsonPath: null,
        });
        expect(config?.ios?.config?.usesNonExemptEncryption).toBe(false);
      } finally {
        if (previous === undefined) delete process.env.APP_VARIANT;
        else process.env.APP_VARIANT = previous;
      }
    },
  );
});
