import { APP_LINK_PATH_PREFIXES } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { checkEntitlements, checkManifest } from './check-links-manifest';

function filter(prefix: string, hosts: readonly string[], verify = true): string {
  return [
    `<intent-filter${verify ? ' android:autoVerify="true"' : ''}>`,
    '<action android:name="android.intent.action.VIEW"/>',
    '<data android:scheme="https"/>',
    ...hosts.map((host) => `<data android:host="${host}"/>`),
    `<data android:pathPrefix="/${prefix}/"/>`,
    '</intent-filter>',
  ].join('');
}

const HOSTS = ['critterpass.app', 'go.critterpass.app'];

describe('checkEntitlements', () => {
  it('passes when both hosts are associated and names each missing one', () => {
    const plist = HOSTS.map((host) => `<string>applinks:${host}</string>`).join('');
    expect(checkEntitlements(plist, 'production')).toEqual([]);
    expect(checkEntitlements('<string>applinks:critterpass.app</string>', 'production')).toEqual([
      'ios: entitlements lack applinks:go.critterpass.app',
    ]);
    expect(checkEntitlements(plist, 'development')).toHaveLength(2);
  });
});

describe('checkManifest', () => {
  it('passes with one verified filter per path on both hosts', () => {
    const manifest = APP_LINK_PATH_PREFIXES.map((prefix) => filter(prefix, HOSTS)).join('');
    expect(checkManifest(manifest, 'production')).toEqual([]);
  });

  it('flags unverified filters, missing paths and missing hosts', () => {
    const manifest = [
      filter('i', HOSTS, false),
      filter('j', ['critterpass.app']),
      ...APP_LINK_PATH_PREFIXES.slice(2).map((prefix) => filter(prefix, HOSTS)),
    ].join('');
    expect(checkManifest(manifest, 'production')).toEqual([
      'android: no autoVerify filter for /i/',
      'android: /j/ filter lacks host go.critterpass.app',
    ]);
  });
});
