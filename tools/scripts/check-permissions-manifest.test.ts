import { describe, expect, it } from 'vitest';

import {
  ANDROID_PERMISSIONS,
  FULL_ACCURACY_PURPOSE_KEY,
  IOS_PLIST_FLAGS,
  IOS_USAGE_KEYS,
} from '@cp/domain';
import { checkAndroidManifest, checkInfoPlist } from './check-permissions-manifest';

function plist(
  overrides: { drop?: string; empty?: string; noLocationMode?: boolean } = {},
): string {
  const strings = IOS_USAGE_KEYS.map((key) => [key, `Why ${key}`] as const)
    .filter(([key]) => key !== overrides.drop)
    .map(
      ([key, value]) =>
        `<key>${key}</key><string>${key === overrides.empty ? ' ' : value}</string>`,
    );
  return [
    '<dict>',
    ...strings,
    `<key>NSLocationTemporaryUsageDescriptionDictionary</key><dict><key>${FULL_ACCURACY_PURPOSE_KEY}</key><string>why</string></dict>`,
    ...IOS_PLIST_FLAGS.map((flag) => `<key>${flag}</key><true/>`),
    `<key>UIBackgroundModes</key><array>${overrides.noLocationMode === true ? '' : '<string>location</string>'}</array>`,
    '</dict>',
  ].join('\n');
}

describe('checkInfoPlist', () => {
  it('passes a complete plist and names each missing or empty key', () => {
    expect(checkInfoPlist(plist())).toEqual([]);
    expect(checkInfoPlist(plist({ drop: 'NSCameraUsageDescription' }))).toEqual([
      'ios: NSCameraUsageDescription missing or empty',
    ]);
    expect(checkInfoPlist(plist({ empty: 'NSAlarmKitUsageDescription' }))).toEqual([
      'ios: NSAlarmKitUsageDescription missing or empty',
    ]);
    expect(checkInfoPlist(plist({ noLocationMode: true }))).toEqual([
      'ios: UIBackgroundModes lacks location',
    ]);
    expect(checkInfoPlist('<dict></dict>')).toContain(
      `ios: temporary full-accuracy purpose ${FULL_ACCURACY_PURPOSE_KEY} missing`,
    );
  });
});

describe('checkAndroidManifest', () => {
  it('passes when every permission is declared and names the missing ones', () => {
    const all = ANDROID_PERMISSIONS.map((name) => `<uses-permission android:name="${name}"/>`).join(
      '',
    );
    expect(checkAndroidManifest(all)).toEqual([]);
    const withoutCamera = all.replace(
      '<uses-permission android:name="android.permission.CAMERA"/>',
      '',
    );
    expect(checkAndroidManifest(withoutCamera)).toEqual([
      'android: android.permission.CAMERA not declared',
    ]);
  });
});
