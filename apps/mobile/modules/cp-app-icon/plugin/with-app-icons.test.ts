/**
 * The icon plugin's manifest and name rules: every catalogue icon gets a launcher alias, the
 * launcher entry leaves MainActivity, and the native names match what cp-app-icon asks for.
 */
import { describe, expect, it } from '@jest/globals';
import type { AndroidConfig } from 'expo/config-plugins';

import {
  APP_ICON_IDS,
  appTargetBuildSettings,
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
  } as unknown as AndroidConfig.Manifest.AndroidManifest;
}

type Alias = { $: Record<string, string> };

describe('with-app-icons', () => {
  it('bundles exactly the catalogue icons', () => {
    // The same list src/lib/app-icon pins against the domain catalogue.
    expect([...APP_ICON_IDS]).toEqual([
      'face',
      'passport',
      'stamp',
      'sticker',
      'temple',
      'sardi',
      'home-set',
      'pon',
      'golden',
      'bali-six',
    ]);
    expect(automaticAlternateIds()).not.toContain('passport');
  });

  it('names forced appearances the way the module asks for them', () => {
    expect(forcedAlternateNames(['dark'])).toContain('home-set-dark');
    expect(automaticAlternateIds()).toContain('bali-six');
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

  it('sets the alternate icon names on the app target only, never on an extension', () => {
    const app = { PRODUCT_NAME: 'CritterPass' };
    const clip = { PRODUCT_NAME: 'Clip' };
    const project = {
      pbxNativeTargetSection: () => ({
        A: { name: '"CritterPass"', buildConfigurationList: 'L1' },
        A_comment: 'CritterPass',
        B: { name: 'AppClip', buildConfigurationList: 'L2' },
      }),
      pbxXCConfigurationList: () => ({
        L1: { buildConfigurations: [{ value: 'C1' }] },
        L2: { buildConfigurations: [{ value: 'C2' }] },
      }),
      pbxXCBuildConfigurationSection: () => ({
        C1: { buildSettings: app },
        C2: { buildSettings: clip },
      }),
    };
    expect(appTargetBuildSettings(project, 'CritterPass')).toEqual([app]);
  });
});
