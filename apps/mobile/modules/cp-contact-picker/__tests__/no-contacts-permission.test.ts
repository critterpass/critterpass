/**
 * The picker must work without any Contacts permission: neither the module nor the app may
 * declare one, and the native code must never open the contact store (which would need it).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

const moduleDir = join(__dirname, '..');
const appDir = join(moduleDir, '..', '..');

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const nativeSources = [
  ...filesUnder(join(moduleDir, 'ios')),
  ...filesUnder(join(moduleDir, 'android', 'src', 'main')),
].filter((path) => !path.includes(`${join('ios', 'Tests')}`));

describe('contact picker permissions', () => {
  it('declares no Android permission', () => {
    const manifest = readFileSync(
      join(moduleDir, 'android', 'src', 'main', 'AndroidManifest.xml'),
      'utf8',
    );
    expect(manifest).not.toMatch(/uses-permission/u);
  });

  it('never names a Contacts permission, usage string or the contact store', () => {
    for (const path of nativeSources) {
      const source = readFileSync(path, 'utf8');
      expect({
        path,
        hit: /READ_CONTACTS|WRITE_CONTACTS|NSContactsUsageDescription/u.test(source),
      }).toEqual({ path, hit: false });
      expect({ path, hit: /CNContactStore|requestAccess/u.test(source) }).toEqual({
        path,
        hit: false,
      });
    }
  });

  it('keeps the app config and dependencies free of Contacts access', () => {
    const config = readFileSync(join(appDir, 'app.config.ts'), 'utf8');
    expect(config).not.toMatch(/CONTACTS|NSContactsUsageDescription|expo-contacts/u);
    const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('expo-contacts');
  });
});
