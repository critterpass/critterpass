/**
 * The icon plugin's manifest and name rules: every catalogue icon gets a launcher alias, the
 * launcher entry leaves MainActivity, and the native names match what cp-app-icon asks for.
 */
import { describe, expect, it } from '@jest/globals';
import { AndroidConfig } from 'expo/config-plugins';

import { APP_ICON_BASE_IDS } from '@cp/domain';

import { nativeIconName } from '../index';
import {
  APP_ICON_IDS,
  applyIconAliases,
  automaticAlternateIds,
  forcedAlternateNames,
} from './with-app-icons';

function manifest(): AndroidConfig.Manifest.AndroidManifest {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [
        {
          $: { 'android:name': '.MainApplication' },
          activity: [
            {
              $: { 'android:name': '.MainActivity', 'android:exported': 'true' },
              'intent-filter': [
                {
                  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
                  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
                },
                {
                  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
                  data: [{ $: { 'android:scheme': 'critterpass' } }],
                },
              ],
            },
          ],
        },
      ],
    },
  } as AndroidConfig.Manifest.AndroidManifest;
}

type Alias = { $: Record<string, string> };

describe('with-app-icons', () => {
  it('bundles exactly the catalogue icons', () => {
    expect([...APP_ICON_IDS]).toEqual([...APP_ICON_BASE_IDS]);
    expect(automaticAlternateIds()).not.toContain('passport');
  });

  it('names forced appearances the way the module asks for them', () => {
    expect(forcedAlternateNames(['dark'])).toContain(nativeIconName('home-set', 'dark'));
    expect(automaticAlternateIds()).toContain(nativeIconName('bali-six', 'auto'));
  });

  it('moves the launcher entry onto one enabled alias per icon and keeps deep links', () => {
    const result = applyIconAliases(manifest());
    const application = result.manifest.application?.[0] as unknown as {
      activity: { 'intent-filter': unknown[] }[];
      'activity-alias': Alias[];
    };
    expect(application.activity[0]?.['intent-filter']).toHaveLength(1);
    const aliases = application['activity-alias'];
    expect(aliases.map((alias) => alias.$['android:name'])).toEqual([
      '.CpIcon_default',
      ...automaticAlternateIds().map((id) => `.CpIcon_${id.replace('-', '_')}`),
    ]);
    expect(aliases.filter((alias) => alias.$['android:enabled'] === 'true')).toHaveLength(1);
    expect(aliases.every((alias) => alias.$['android:targetActivity'] === '.MainActivity')).toBe(
      true,
    );
  });

  it('is idempotent across prebuilds', () => {
    const twice = applyIconAliases(applyIconAliases(manifest()));
    const application = twice.manifest.application?.[0] as unknown as {
      'activity-alias': Alias[];
    };
    expect(application['activity-alias']).toHaveLength(APP_ICON_IDS.length);
  });
});
