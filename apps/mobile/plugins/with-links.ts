/**
 * Native link claims for each app variant: iOS associated domains (`applinks:` and
 * `webcredentials:` for both link hosts) and Android App Link intent filters (`autoVerify`, one per
 * link path, both hosts). The custom scheme comes from app.config.ts's own `scheme`.
 *
 * Expo loads config plugins with Node's plain TypeScript stripping, which cannot resolve the
 * workspace package's extensionless imports, so the host and path tables below mirror
 * packages/domain/src/links/{hosts,grammar}.ts; ./with-links.test.ts
 * and tools/scripts/check-links-manifest.ts fail on any drift between the two.
 */
import {
  AndroidConfig,
  withAndroidManifest,
  withEntitlementsPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

export type LinkVariant = 'development' | 'staging' | 'production';

export const LINK_HOSTS: Readonly<Record<LinkVariant, readonly [string, string]>> = {
  production: ['critterpass.app', 'go.critterpass.app'],
  staging: ['staging.critterpass.app', 'go.staging.critterpass.app'],
  development: ['staging.critterpass.app', 'go.staging.critterpass.app'],
};

/** First path segments that open the app (grammar.ts `APP_LINK_PATH_PREFIXES`). */
export const APP_LINK_PATH_PREFIXES: readonly string[] = [
  'i',
  'j',
  'p',
  'r',
  'plan',
  'g',
  'locals',
  'app',
];

const ASSOCIATED_DOMAINS_KEY = 'com.apple.developer.associated-domains';

export function associatedDomains(variant: LinkVariant): string[] {
  // Development builds bypass Apple's association CDN cache while the files change.
  const mode = variant === 'development' ? '?mode=developer' : '';
  return LINK_HOSTS[variant].flatMap((host) => [
    `applinks:${host}${mode}`,
    `webcredentials:${host}${mode}`,
  ]);
}

type IntentFilter = AndroidConfig.Manifest.ManifestIntentFilter;

export function appLinkIntentFilters(variant: LinkVariant): IntentFilter[] {
  return APP_LINK_PATH_PREFIXES.map((prefix) => ({
    $: { 'android:autoVerify': 'true' },
    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: [
      { $: { 'android:name': 'android.intent.category.DEFAULT' } },
      { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
    ],
    data: [
      { $: { 'android:scheme': 'https' } },
      ...LINK_HOSTS[variant].map((host) => ({ $: { 'android:host': host } })),
      { $: { 'android:pathPrefix': `/${prefix}/` } },
    ],
  }));
}

function isAppLinkFilter(filter: IntentFilter): boolean {
  return filter.$?.['android:autoVerify'] === 'true';
}

const withLinks: ConfigPlugin<{ variant: LinkVariant }> = (config, { variant }) => {
  const withIos = withEntitlementsPlist(config, (mod) => {
    const existing = mod.modResults[ASSOCIATED_DOMAINS_KEY];
    const current = Array.isArray(existing) ? (existing as string[]) : [];
    mod.modResults[ASSOCIATED_DOMAINS_KEY] = [
      ...new Set([...current, ...associatedDomains(variant)]),
    ];
    return mod;
  });
  return withAndroidManifest(withIos, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const kept = (activity['intent-filter'] ?? []).filter((filter) => !isAppLinkFilter(filter));
    activity['intent-filter'] = [...kept, ...appLinkIntentFilters(variant)];
    return mod;
  });
};

// Expo resolves a string-referenced config plugin through the module's default export.
// eslint-disable-next-line no-restricted-syntax -- config plugin entry, like a tool config
export default withLinks;
