/* eslint-disable lingui/no-unlocalized-strings -- env names and URLs, not UI copy. */
/**
 * Link settings the Worker reads per request. The environment comes from the host the request
 * arrived on (so one Worker build serves both hosts of its pair correctly); unknown hosts (local
 * `wrangler dev`, previews) fall back to `LINKS_ENV`, then staging.
 */
import {
  LINK_ENVIRONMENT_CONFIG,
  LINK_ENVIRONMENTS,
  linkEnvironmentForHost,
  type LinkEnvironment,
  type LinkEnvironmentConfig,
} from '@cp/domain';

/** Worker variables and secrets this feature reads (Wrangler `vars` / secrets). */
export interface LinksWebEnv {
  readonly LINKS_ENV?: string;
  /** Overrides the api origin, e.g. a local api in tests. */
  readonly LINKS_API_BASE_URL?: string;
  /** Same value as the api's `LINKS_WEB_PROXY_SECRET`. */
  readonly LINKS_WEB_PROXY_SECRET?: string;
  /** `{"<package>": ["AA:BB:…"]}` Android signing-cert SHA-256 fingerprints. */
  readonly ANDROID_CERT_FINGERPRINTS?: string;
}

const DEFAULT_API_BASE_URL: Readonly<Record<LinkEnvironment, string>> = {
  production: 'https://api.critterpass.app',
  staging: 'https://api-staging-de92.up.railway.app',
  development: 'https://api-staging-de92.up.railway.app',
};

export interface LinkRequestContext {
  readonly config: LinkEnvironmentConfig;
  /** The host this request was served on. */
  readonly host: string;
  /** The other host of the pair: taps on it can open the app even from a page on this host. */
  readonly otherHost: string;
  readonly apiBaseUrl: string;
}

function fallbackEnvironment(value: string | undefined): LinkEnvironment {
  return (LINK_ENVIRONMENTS as readonly string[]).includes(value ?? '')
    ? (value as LinkEnvironment)
    : 'staging';
}

export function linkRequestContext(requestUrl: URL, env: LinksWebEnv): LinkRequestContext {
  const host = requestUrl.hostname.toLowerCase();
  const config =
    LINK_ENVIRONMENT_CONFIG[linkEnvironmentForHost(host) ?? fallbackEnvironment(env.LINKS_ENV)];
  const otherHost = host === config.altHost ? config.primaryHost : config.altHost;
  const apiBaseUrl = (env.LINKS_API_BASE_URL ?? DEFAULT_API_BASE_URL[config.env]).replace(
    /\/+$/,
    '',
  );
  return { config, host, otherHost, apiBaseUrl };
}
