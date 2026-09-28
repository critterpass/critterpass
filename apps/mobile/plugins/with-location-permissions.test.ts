/**
 * plugins/with-location-permissions.ts writes every permission string and Android permission
 * explicitly; this checks what it writes and that it merges with other plugins' output.
 */
import {
  ANDROID_PERMISSIONS as DOMAIN_ANDROID_PERMISSIONS,
  FULL_ACCURACY_PURPOSE_KEY as DOMAIN_PURPOSE_KEY,
  IOS_PLIST_FLAGS,
  IOS_USAGE_KEYS,
} from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import {
  ANDROID_PERMISSIONS,
  applyAndroidPermissions,
  applyInfoPlist,
  FULL_ACCURACY_PURPOSE_KEY,
  IOS_FLAGS,
  IOS_USAGE_STRINGS,
} from './with-location-permissions';

describe('with-location-permissions config plugin', () => {
  it('mirrors the shared permission manifest exactly', () => {
    expect(Object.keys(IOS_USAGE_STRINGS).sort()).toEqual([...IOS_USAGE_KEYS].sort());
    expect(IOS_FLAGS).toEqual([...IOS_PLIST_FLAGS]);
    expect(ANDROID_PERMISSIONS).toEqual([...DOMAIN_ANDROID_PERMISSIONS]);
    expect(FULL_ACCURACY_PURPOSE_KEY).toBe(DOMAIN_PURPOSE_KEY);
  });

  it('writes every usage string, the temporary accuracy purpose and the Live Activity flags', () => {
    const plist = applyInfoPlist({
      NSCameraUsageDescription: 'older copy',
      UIBackgroundModes: ['remote-notification'],
    });
    for (const [key, value] of Object.entries(IOS_USAGE_STRINGS)) {
      expect(plist[key]).toBe(value);
      expect(value.trim()).not.toBe('');
    }
    expect(plist['NSLocationTemporaryUsageDescriptionDictionary']).toHaveProperty(
      FULL_ACCURACY_PURPOSE_KEY,
    );
    expect(plist['NSSupportsLiveActivities']).toBe(true);
    expect(plist['NSSupportsLiveActivitiesFrequentUpdates']).toBe(true);
    expect(plist['UIBackgroundModes']).toEqual(['remote-notification', 'location']);
    expect(applyInfoPlist(plist)['UIBackgroundModes']).toEqual(['remote-notification', 'location']);
  });

  it('adds each Android permission once, keeping ones other plugins declared', () => {
    const config = {
      manifest: {
        'uses-permission': [
          { $: { 'android:name': 'android.permission.INTERNET' } },
          { $: { 'android:name': 'android.permission.CAMERA' } },
        ],
      },
    };
    const names = applyAndroidPermissions(config).manifest['uses-permission'].map(
      (entry) => entry.$['android:name'],
    );
    expect(names).toEqual(
      expect.arrayContaining([...ANDROID_PERMISSIONS, 'android.permission.INTERNET']),
    );
    expect(new Set(names).size).toBe(names.length);
    expect(
      applyAndroidPermissions<{
        manifest: { 'uses-permission'?: { $: { 'android:name': string } }[] };
      }>({ manifest: {} }).manifest['uses-permission'],
    ).toHaveLength(ANDROID_PERMISSIONS.length);
  });
});
