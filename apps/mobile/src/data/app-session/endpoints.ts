/**
 * Where this build's services live. `EXPO_PUBLIC_*` values are inlined by Metro at build time from
 * the EAS environment, the build profile (eas.json) or a local `.env`, and always win. Unset, a
 * production build uses the production services and every other variant (development, e2e,
 * staging) uses staging, so a build without them still gets a working session and never points
 * production at staging. The api reader lives next to its clients (places/apiBaseUrl.ts); this
 * file resolves PowerSync and the realtime socket and writes the `config/endpoints.json` the
 * extensions read. It imports expo-constants, so the Node sync harness never imports it (the
 * connector it runs takes its endpoint as an argument).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: URLs and wire values only. */
import Constants from 'expo-constants';

import { buildEndpointsConfig, type EndpointsConfig } from '@cp/domain';

export type AppEnvironment = EndpointsConfig['env'];

export interface ServiceEndpoints {
  readonly api: string;
  readonly powerSync: string;
  readonly realtime: string;
}

const PRODUCTION_ENDPOINTS: ServiceEndpoints = {
  api: 'https://api.critterpass.app',
  powerSync: 'https://sync.critterpass.app',
  realtime: 'wss://rt.critterpass.app/connection/websocket',
};

/** The staging Railway domains (the staging EAS profile carries the same values). */
const STAGING_ENDPOINTS: ServiceEndpoints = {
  api: 'https://api-staging-de92.up.railway.app',
  powerSync: 'https://powersync-api-staging.up.railway.app',
  realtime: 'wss://centrifugo-staging-652b.up.railway.app/connection/websocket',
};

const ENVIRONMENTS: readonly AppEnvironment[] = ['development', 'staging', 'production'];

/** The `appVariant` app.config.ts puts in `extra`; anything unknown counts as development. */
export function appEnvironment(appVariant: unknown): AppEnvironment {
  return ENVIRONMENTS.find((env) => env === appVariant) ?? 'development';
}

/** This build's environment, from the variant app.config.ts put in `extra`. */
export function currentAppEnvironment(): AppEnvironment {
  return appEnvironment(Constants.expoConfig?.extra?.['appVariant']);
}

/** The services a build of `env` talks to when no `EXPO_PUBLIC_*` value overrides them. */
export function defaultEndpoints(env: AppEnvironment): ServiceEndpoints {
  return env === 'production' ? PRODUCTION_ENDPOINTS : STAGING_ENDPOINTS;
}

/** An inlined env value, else `fallback` (unset and empty both count as absent). */
export function endpointOr(fromEnv: string | undefined, fallback: string): string {
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : fallback;
}

/** `EXPO_PUBLIC_POWERSYNC_URL`, else the build's default PowerSync service. */
export function resolvePowerSyncUrl(env: AppEnvironment = currentAppEnvironment()): string {
  return endpointOr(process.env['EXPO_PUBLIC_POWERSYNC_URL'], defaultEndpoints(env).powerSync);
}

/** `EXPO_PUBLIC_REALTIME_URL` (Centrifugo's `wss://…/connection/websocket`), else the default. */
export function resolveRealtimeUrl(env: AppEnvironment = currentAppEnvironment()): string {
  return endpointOr(process.env['EXPO_PUBLIC_REALTIME_URL'], defaultEndpoints(env).realtime);
}

/** The `config/endpoints.json` text for this build, as the App Group module writes it. */
export function endpointsConfigJson(input: {
  readonly env: AppEnvironment;
  readonly apiBaseUrl: string;
  readonly now: Date;
}): string {
  return JSON.stringify(buildEndpointsConfig(input));
}
