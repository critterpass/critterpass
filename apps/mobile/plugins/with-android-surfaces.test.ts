/**
 * plugins/with-android-surfaces.ts: the surfaces' permissions are declared once each, and the
 * restricted alarm-clock permission can never reach the merged manifest.
 */
import { describe, expect, it } from '@jest/globals';

import {
  applySurfacePermissions,
  FORBIDDEN_PERMISSIONS,
  SURFACE_PERMISSIONS,
} from './with-android-surfaces';

function names(config: ReturnType<typeof applySurfacePermissions>, removed: boolean) {
  return (config.manifest['uses-permission'] ?? [])
    .filter((entry) => (entry.$['tools:node'] === 'remove') === removed)
    .map((entry) => entry.$['android:name']);
}

describe('with-android-surfaces config plugin', () => {
  it('declares each surface permission once, keeping what other plugins declared', () => {
    const config = applySurfacePermissions({
      manifest: {
        'uses-permission': [
          { $: { 'android:name': 'android.permission.INTERNET' } },
          { $: { 'android:name': 'android.permission.SCHEDULE_EXACT_ALARM' } },
        ],
      },
    });
    expect(names(config, false)).toEqual([
      'android.permission.INTERNET',
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.POST_PROMOTED_NOTIFICATIONS',
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.ACCESS_NOTIFICATION_POLICY',
    ]);
    expect(applySurfacePermissions(config).manifest['uses-permission']).toHaveLength(6);
  });

  it('never declares USE_EXACT_ALARM and strips it from library manifests', () => {
    const config = applySurfacePermissions({
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        'uses-permission': [{ $: { 'android:name': 'android.permission.USE_EXACT_ALARM' } }],
      },
    });
    expect(SURFACE_PERMISSIONS).not.toContain('android.permission.USE_EXACT_ALARM');
    expect(names(config, false)).not.toContain('android.permission.USE_EXACT_ALARM');
    expect(names(config, true)).toEqual([...FORBIDDEN_PERMISSIONS]);
    expect(config.manifest.$).toEqual({
      'xmlns:android': 'http://schemas.android.com/apk/res/android',
      'xmlns:tools': 'http://schemas.android.com/tools',
    });
  });
});
