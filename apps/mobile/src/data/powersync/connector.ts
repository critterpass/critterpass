/**
 * The PowerSync backend connector (docs/system-architecture.md §4.2): credentials are a short-lived
 * `aud: sync` token from `GET /api/auth/token?aud=sync` (the auth layer caches and refreshes it),
 * and uploads flush the local `commands` queue through `POST /sync/upload`. Synced tables are never
 * written locally, so PowerSync's own CRUD queue stays empty and the command queue triggers its own
 * flushes; `uploadData` still flushes it whenever PowerSync asks.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is SQL, a route path, a wire code or a developer-facing error, never copy. */
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/common';

export interface SyncConnectorOptions {
  /** PowerSync service URL, e.g. `https://sync.critterpass.app`. */
  readonly endpoint: string;
  readonly getSyncToken: () => Promise<string>;
  readonly flushCommands: () => Promise<void>;
}

const DEFAULT_POWERSYNC_URL = 'https://sync.critterpass.app';

/** `EXPO_PUBLIC_POWERSYNC_URL` (inlined by Metro at build time), else the production service. */
export function resolvePowerSyncUrl(): string {
  const fromEnv = process.env['EXPO_PUBLIC_POWERSYNC_URL'];
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : DEFAULT_POWERSYNC_URL;
}

export function createSyncConnector(options: SyncConnectorOptions): PowerSyncBackendConnector {
  return {
    async fetchCredentials(): Promise<PowerSyncCredentials> {
      return { endpoint: options.endpoint, token: await options.getSyncToken() };
    },
    async uploadData(): Promise<void> {
      await options.flushCommands();
    },
  };
}
