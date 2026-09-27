/* eslint-disable lingui/no-unlocalized-strings -- association-file JSON keys, not UI copy. */
/**
 * The two OS association files each link host serves (docs/api-contracts.md §5.6): Apple's
 * `apple-app-site-association` and Android's `assetlinks.json`. Both are built per request host
 * from the shared link config, so `critterpass.app` and `go.critterpass.app` vouch for the
 * production app and the staging hosts for the staging and development apps. Paths that must stay
 * in the browser (`/`, tips, legal, help, account) are excluded before the app paths are claimed.
 */
import {
  APP_LINK_EXCLUDED_PATHS,
  APP_LINK_PATH_PREFIXES,
  APPLE_TEAM_ID,
  appClipBundleId,
  appIdsForHost,
} from '@cp/domain';

interface PathComponent {
  readonly '/': string;
  readonly exclude?: true;
}

function pathComponents(): readonly PathComponent[] {
  return [
    ...APP_LINK_EXCLUDED_PATHS.map((path) => ({ '/': path, exclude: true as const })),
    ...APP_LINK_PATH_PREFIXES.map((prefix) => ({ '/': `/${prefix}/*` })),
  ];
}

export interface AppleAssociationOptions {
  /** The `links.app_clip` flag: only while it is on do this host's apps' clips get invoked. */
  readonly appClip?: boolean;
}

export function appleAppSiteAssociation(host: string, options: AppleAssociationOptions = {}) {
  const hostAppIds = appIdsForHost(host);
  const appIds = hostAppIds.map((appId) => `${APPLE_TEAM_ID}.${appId}`);
  return {
    applinks: { details: [{ appIDs: appIds, components: pathComponents() }] },
    webcredentials: { apps: appIds },
    ...(options.appClip === true && hostAppIds.length > 0
      ? {
          appclips: {
            apps: hostAppIds.map((appId) => `${APPLE_TEAM_ID}.${appClipBundleId(appId)}`),
          },
        }
      : {}),
  };
}

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Parses `ANDROID_CERT_FINGERPRINTS` (`{"<package>": ["AA:BB:…", …]}`: the upload key and the Play
 * app-signing key of each package). Malformed entries are dropped rather than published.
 */
export function parseCertFingerprints(raw: string | undefined): Record<string, string[]> {
  if (raw === undefined || raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result: Record<string, string[]> = {};
  for (const [pkg, prints] of Object.entries(parsed)) {
    if (!Array.isArray(prints)) continue;
    const valid = prints
      .filter((print): print is string => typeof print === 'string')
      .map((print) => print.toUpperCase())
      .filter((print) => FINGERPRINT.test(print));
    if (valid.length > 0) result[pkg] = valid;
  }
  return result;
}

/**
 * One statement per package this host vouches for that has signing fingerprints configured; a
 * package without any is left out rather than published with a placeholder.
 */
export function assetLinks(host: string, fingerprints: Readonly<Record<string, string[]>>) {
  return appIdsForHost(host).flatMap((packageName) => {
    const prints = fingerprints[packageName];
    if (prints === undefined || prints.length === 0) return [];
    return [
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: prints,
        },
        relation_extensions: {
          'delegate_permission/common.handle_all_urls': {
            dynamic_app_link_components: pathComponents(),
          },
        },
      },
    ];
  });
}
