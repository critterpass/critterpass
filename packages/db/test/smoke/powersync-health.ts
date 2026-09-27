/**
 * Waits until a running PowerSync Service is ready to serve the committed Sync Streams:
 * readiness probe up, source database connected, initial replication done, the active sync
 * config equal to infra/powersync/sync-streams.yaml and free of errors (warnings are printed).
 *
 *   docker compose -f infra/docker-compose.yml up -d --wait powersync
 *   pnpm --filter @cp/db exec tsx test/smoke/powersync-health.ts
 *
 * POWERSYNC_URL (default http://localhost:8080) and PS_ADMIN_API_TOKEN (default: the compose
 * stack's local token) select the instance; POWERSYNC_READY_TIMEOUT_MS bounds the wait.
 */
import { readFile } from 'node:fs/promises';

import { GENERATED_PATH } from '../../../../infra/powersync/build-config';

const LOCAL_ADMIN_TOKEN = 'local-powersync-admin-token';
const POLL_MS = 2_000;

interface Issue {
  readonly level: string;
  readonly message: string;
}

interface Diagnostics {
  readonly connections: readonly {
    readonly connected: boolean;
    readonly errors: readonly Issue[];
  }[];
  readonly active_sync_rules?: {
    readonly content?: string;
    readonly errors: readonly Issue[];
    readonly connections: readonly {
      readonly initial_replication_done: boolean;
      readonly tables: readonly { readonly name: string; readonly errors: readonly Issue[] }[];
    }[];
  };
}

function isDiagnostics(value: unknown): value is { data: Diagnostics } {
  if (typeof value !== 'object' || value === null || !('data' in value)) return false;
  const { data } = value;
  return typeof data === 'object' && data !== null && 'connections' in data;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → HTTP ${response.status}`);
  return response.json();
}

/** Why the service is not ready yet, or undefined when it is. Warnings are returned separately. */
function assess(
  diagnostics: Diagnostics,
  expectedContent: string,
): { readonly blocker?: string; readonly warnings: readonly string[] } {
  const sourceErrors = diagnostics.connections.flatMap((connection) => connection.errors);
  if (sourceErrors.length > 0 || diagnostics.connections.some((c) => !c.connected)) {
    return {
      blocker: `source database: ${sourceErrors.map((e) => e.message).join('; ') || 'not connected'}`,
      warnings: [],
    };
  }
  const active = diagnostics.active_sync_rules;
  if (active === undefined) return { blocker: 'no active sync config yet', warnings: [] };
  const warnings = active.errors.filter((e) => e.level === 'warning').map((e) => e.message);
  const errors = active.errors.filter((e) => e.level !== 'warning').map((e) => e.message);
  const tableErrors = active.connections.flatMap((c) =>
    c.tables.flatMap((table) => table.errors.map((e) => `${table.name}: ${e.message}`)),
  );
  if (errors.length > 0 || tableErrors.length > 0) {
    return { blocker: `sync config errors: ${[...errors, ...tableErrors].join('; ')}`, warnings };
  }
  if (active.content !== expectedContent) {
    return {
      blocker: 'active sync config differs from infra/powersync/sync-streams.yaml',
      warnings,
    };
  }
  if (active.connections.some((c) => !c.initial_replication_done)) {
    return { blocker: 'initial replication still running', warnings };
  }
  return { warnings };
}

async function main(): Promise<void> {
  const baseUrl = (process.env['POWERSYNC_URL'] ?? 'http://localhost:8080').replace(/\/$/, '');
  const token = process.env['PS_ADMIN_API_TOKEN'] ?? LOCAL_ADMIN_TOKEN;
  const timeoutMs = Number(process.env['POWERSYNC_READY_TIMEOUT_MS'] ?? 120_000);
  const expectedContent = await readFile(GENERATED_PATH, 'utf8');
  const deadline = Date.now() + timeoutMs;
  let lastBlocker = 'not reached yet';

  while (Date.now() < deadline) {
    try {
      const readiness = await fetchJson(`${baseUrl}/probes/readiness`);
      if (
        typeof readiness !== 'object' ||
        readiness === null ||
        !('ready' in readiness) ||
        readiness.ready !== true
      ) {
        throw new Error('readiness probe not ready');
      }
      const body = await fetchJson(`${baseUrl}/api/admin/v1/diagnostics`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sync_rules_content: true }),
      });
      if (!isDiagnostics(body)) throw new Error('unexpected diagnostics response');
      const { blocker, warnings } = assess(body.data, expectedContent);
      if (blocker === undefined) {
        for (const warning of warnings) console.warn(`warn  ${warning}`);
        console.log(`ready powersync at ${baseUrl}: replication done, sync config active`);
        return;
      }
      lastBlocker = blocker;
    } catch (error) {
      lastBlocker = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  console.error(`powersync at ${baseUrl} not ready after ${timeoutMs} ms: ${lastBlocker}`);
  process.exitCode = 1;
}

await main();
