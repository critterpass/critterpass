/**
 * Where this build's services live. `EXPO_PUBLIC_*` values are inlined by Metro at build time from
 * the EAS build profile (eas.json) or a local `.env`. The api and PowerSync readers live next to their clients (places/apiBaseUrl.ts, powersync/connector.ts);
 * this file adds the realtime socket and the `config/endpoints.json` the extensions read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: URLs and wire values only. */
import { buildEndpointsConfig, type EndpointsConfig } from '@cp/domain';

const DEFAULT_REALTIME_URL = 'wss://rt.critterpass.app/connection/websocket';

/** `EXPO_PUBLIC_REALTIME_URL` (Centrifugo's `wss://…/connection/websocket`), else production. */
export function resolveRealtimeUrl(): string {
  const fromEnv = process.env['EXPO_PUBLIC_REALTIME_URL'];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : DEFAULT_REALTIME_URL;
}

export type AppEnvironment = EndpointsConfig['env'];

const ENVIRONMENTS: readonly AppEnvironment[] = ['development', 'staging', 'production'];

/** The `appVariant` app.config.ts puts in `extra`; anything unknown counts as development. */
export function appEnvironment(appVariant: unknown): AppEnvironment {
  return ENVIRONMENTS.find((env) => env === appVariant) ?? 'development';
}

/** The `config/endpoints.json` text for this build, as the App Group module writes it. */
export function endpointsConfigJson(input: {
  readonly env: AppEnvironment;
  readonly apiBaseUrl: string;
  readonly now: Date;
}): string {
  return JSON.stringify(buildEndpointsConfig(input));
}
