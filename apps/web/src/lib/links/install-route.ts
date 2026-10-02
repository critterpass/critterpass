/**
 * How a visitor without the app gets it. Production sends them to the two stores. Any other host
 * (staging, local) serves a test app that is on neither store: there the iOS way in is the public
 * TestFlight link when one is configured (the `TESTFLIGHT_URL` Worker variable), and otherwise the
 * page asks the visitor to get the TestFlight invite from whoever invited them.
 */
import type { LinkEnvironmentConfig } from '@cp/domain';

import { appStoreUrl, playStoreUrl } from './store-url';

export type InstallRoute =
  | {
      readonly kind: 'stores';
      readonly appStoreHref: string | null;
      readonly playStoreHref: string;
    }
  | { readonly kind: 'testflight'; readonly href: string }
  | { readonly kind: 'ask-inviter' };

const TESTFLIGHT_LINK = /^https:\/\/testflight\.apple\.com\/join\/[A-Za-z0-9]+$/u;

/** A public TestFlight link (`https://testflight.apple.com/join/<code>`), or null for anything else. */
export function parseTestFlightUrl(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return TESTFLIGHT_LINK.test(trimmed) ? trimmed : null;
}

export function installRoute(
  config: LinkEnvironmentConfig,
  linkPath: string | null,
  testFlightUrl: string | null,
): InstallRoute {
  if (config.env === 'production') {
    return {
      kind: 'stores',
      appStoreHref: appStoreUrl(config),
      playStoreHref: playStoreUrl(config, linkPath),
    };
  }
  return testFlightUrl === null
    ? { kind: 'ask-inviter' }
    : { kind: 'testflight', href: testFlightUrl };
}

/** Where an iOS "open" tap that reached the web goes on: the App Store or TestFlight, if any. */
export function iosInstallHref(route: InstallRoute): string | null {
  if (route.kind === 'stores') return route.appStoreHref;
  return route.kind === 'testflight' ? route.href : null;
}
