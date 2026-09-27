/**
 * Which web hosts carry app links for each app variant, and which apps each host vouches for
 * (docs/system-architecture.md §14). One table feeds the web association files, the native link
 * config plugin, link parsing on every side and the claim validator, so a host is never added in
 * one place and forgotten in another.
 *
 * Each environment has a primary host and an alternate `go.` host: iOS never opens a Universal
 * Link for a tap on the same domain, so the handoff page's "Open in app" button points at the
 * other host of the pair.
 */

export const LINK_ENVIRONMENTS = ['production', 'staging', 'development'] as const;
export type LinkEnvironment = (typeof LINK_ENVIRONMENTS)[number];

export const APPLE_TEAM_ID = 'YFND2EEW8S';

export interface LinkEnvironmentConfig {
  readonly env: LinkEnvironment;
  readonly primaryHost: string;
  readonly altHost: string;
  /** Custom URL scheme for notifications, widgets and extensions (app.config.ts `scheme`). */
  readonly scheme: string;
  /** iOS bundle id and Android application id (identical for every variant). */
  readonly appId: string;
  /** App Store id (the `submit` profile's `ascAppId` in apps/mobile/eas.json); null when never listed. */
  readonly appStoreId: string | null;
}

export const LINK_ENVIRONMENT_CONFIG: Readonly<Record<LinkEnvironment, LinkEnvironmentConfig>> = {
  production: {
    env: 'production',
    primaryHost: 'critterpass.app',
    altHost: 'go.critterpass.app',
    scheme: 'critterpass',
    appId: 'app.critterpass',
    appStoreId: '6816655856',
  },
  staging: {
    env: 'staging',
    primaryHost: 'staging.critterpass.app',
    altHost: 'go.staging.critterpass.app',
    scheme: 'critterpass-staging',
    appId: 'app.critterpass.staging',
    appStoreId: '6816656656',
  },
  // Development builds claim the staging hosts (with `?mode=developer` on iOS, so Apple's CDN
  // cache is bypassed while the association file changes).
  development: {
    env: 'development',
    primaryHost: 'staging.critterpass.app',
    altHost: 'go.staging.critterpass.app',
    scheme: 'critterpass-dev',
    appId: 'app.critterpass.dev',
    appStoreId: null,
  },
};

/** Both link hosts of one environment, primary first. */
export function linkHostsFor(env: LinkEnvironment): readonly [string, string] {
  const config = LINK_ENVIRONMENT_CONFIG[env];
  return [config.primaryHost, config.altHost];
}

/** Every host any environment serves links on. */
export const ALL_LINK_HOSTS: readonly string[] = [
  ...new Set(LINK_ENVIRONMENTS.flatMap((env) => linkHostsFor(env))),
];

export function isLinkHost(host: string, env?: LinkEnvironment): boolean {
  const normalized = host.toLowerCase();
  const hosts = env === undefined ? ALL_LINK_HOSTS : linkHostsFor(env);
  return hosts.includes(normalized);
}

/**
 * The apps a web host vouches for in its association files: production hosts vouch for the
 * production app only; staging hosts vouch for the staging and development apps.
 */
export function appIdsForHost(host: string): readonly string[] {
  const normalized = host.toLowerCase();
  return LINK_ENVIRONMENTS.filter((env) => linkHostsFor(env).includes(normalized)).map(
    (env) => LINK_ENVIRONMENT_CONFIG[env].appId,
  );
}

/** The environment whose web deployment serves `host`; staging hosts belong to staging. */
export function linkEnvironmentForHost(host: string): LinkEnvironment | null {
  const normalized = host.toLowerCase();
  if (linkHostsFor('production').includes(normalized)) return 'production';
  if (linkHostsFor('staging').includes(normalized)) return 'staging';
  return null;
}
