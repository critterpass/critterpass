import { describe, expect, it } from 'vitest';

import {
  checkBundle,
  declaredInConfig,
  declaredInPlist,
  usedCategories,
} from './privacy-manifest-check';

const USER_DEFAULTS = 'NSPrivacyAccessedAPICategoryUserDefaults';

describe('privacy manifests', () => {
  it('finds required-reason API calls in Swift', () => {
    expect(
      usedCategories([
        'let on = UserDefaults.standard.bool(forKey: "k")',
        'let up = ProcessInfo.processInfo.systemUptime',
      ]),
    ).toEqual([USER_DEFAULTS, 'NSPrivacyAccessedAPICategorySystemBootTime']);
    expect(usedCategories(['let defaults = 1'])).toEqual([]);
  });

  it('reads declared categories from a config object and a plist, skipping ones without reasons', () => {
    expect(
      declaredInConfig({
        NSPrivacyAccessedAPITypes: [
          { NSPrivacyAccessedAPIType: USER_DEFAULTS, NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
          { NSPrivacyAccessedAPIType: 'X', NSPrivacyAccessedAPITypeReasons: [] },
        ],
      }),
    ).toEqual([USER_DEFAULTS]);
    expect(declaredInConfig({})).toEqual([]);
    const plist = `<dict><key>NSPrivacyAccessedAPIType</key><string>${USER_DEFAULTS}</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array></dict>
      <dict><key>NSPrivacyAccessedAPIType</key><string>NoReasons</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array/></dict>`;
    expect(declaredInPlist(plist)).toEqual([USER_DEFAULTS]);
  });

  it('fails an app without a manifest and any undeclared category', () => {
    const app = checkBundle({
      name: 'app',
      kind: 'app',
      used: [USER_DEFAULTS],
      declared: undefined,
    });
    expect(app.problems).toEqual(['no privacy manifest', `${USER_DEFAULTS} used but not declared`]);
    const ext = checkBundle({ name: 'w', kind: 'extension', used: [USER_DEFAULTS], declared: [] });
    expect(ext.problems).toEqual([`${USER_DEFAULTS} used but not declared`]);
  });

  it('notes an extension without a manifest that calls nothing, and passes a declared one', () => {
    const quiet = checkBundle({ name: 'w', kind: 'extension', used: [], declared: undefined });
    expect(quiet.problems).toEqual([]);
    expect(quiet.notes).toHaveLength(1);
    const ok = checkBundle({
      name: 'app',
      kind: 'app',
      used: [USER_DEFAULTS],
      declared: [USER_DEFAULTS],
    });
    expect(ok.problems).toEqual([]);
  });
});
