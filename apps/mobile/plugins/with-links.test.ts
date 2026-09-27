/**
 * plugins/with-links.ts mirrors the shared link tables (it cannot import @cp/domain at config
 * time); this pins the two together and checks what the plugin writes for each variant.
 */
import { describe, expect, it } from '@jest/globals';
import {
  APP_LINK_PATH_PREFIXES as DOMAIN_PREFIXES,
  LINK_ENVIRONMENT_CONFIG,
  LINK_ENVIRONMENTS,
  linkHostsFor,
} from '@cp/domain';

import {
  APP_LINK_PATH_PREFIXES,
  appLinkIntentFilters,
  associatedDomains,
  LINK_HOSTS,
} from './with-links';

interface ClipTargetConfig {
  (config: { extra?: { appVariant?: string } }): { entitlements: Record<string, unknown> };
  readonly LINK_HOSTS: Record<string, readonly string[]>;
}

// The clip's target config is CommonJS that @bacons/apple-targets loads with a plain require.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS target config
const clipTarget = require('../targets/app-clip/expo-target.config') as ClipTargetConfig;

describe('with-links config plugin', () => {
  it('claims exactly the shared hosts and link paths', () => {
    expect(APP_LINK_PATH_PREFIXES).toEqual(DOMAIN_PREFIXES);
    for (const env of LINK_ENVIRONMENTS) expect(LINK_HOSTS[env]).toEqual(linkHostsFor(env));
  });

  it('associates both hosts for links and credentials, in developer mode for dev builds', () => {
    expect(associatedDomains('production')).toEqual([
      'applinks:critterpass.app',
      'webcredentials:critterpass.app',
      'applinks:go.critterpass.app',
      'webcredentials:go.critterpass.app',
    ]);
    expect(
      associatedDomains('development').every((entry) => entry.endsWith('?mode=developer')),
    ).toBe(true);
  });

  it('invokes the App Clip from the same hosts the app links claim', () => {
    expect(clipTarget.LINK_HOSTS).toEqual(LINK_HOSTS);
    const clip = clipTarget({ extra: { appVariant: 'development' } });
    expect(clip.entitlements['com.apple.developer.associated-domains']).toEqual(
      associatedDomains('development')
        .filter((entry) => entry.startsWith('applinks:'))
        .map((entry) => entry.replace('applinks:', 'appclips:')),
    );
  });

  it('adds one auto-verified https filter per link path covering both hosts', () => {
    const filters = appLinkIntentFilters('staging');
    expect(filters).toHaveLength(DOMAIN_PREFIXES.length);
    for (const [index, filter] of filters.entries()) {
      expect(filter.$?.['android:autoVerify']).toBe('true');
      const data = (filter.data ?? []).map((entry) => entry.$);
      expect(data).toContainEqual({ 'android:scheme': 'https' });
      expect(data).toContainEqual({ 'android:host': LINK_ENVIRONMENT_CONFIG.staging.primaryHost });
      expect(data).toContainEqual({ 'android:host': LINK_ENVIRONMENT_CONFIG.staging.altHost });
      expect(data).toContainEqual({ 'android:pathPrefix': `/${DOMAIN_PREFIXES[index]}/` });
    }
  });
});
