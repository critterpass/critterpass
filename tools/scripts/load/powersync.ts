/**
 * PowerSync initial-sync load: `--clients` real accounts open the sync stream at once and each
 * reports the time to its first complete checkpoint. Run it alone for the cold-start curve, and
 * again while `tools/scripts/drills/failover.ts` switches the database over to see clients resume.
 *
 *   API_BASE_URL=https://api-staging-… POWERSYNC_URL=https://powersync-api-staging.up.railway.app \
 *   pnpm tsx tools/scripts/load/powersync.ts --staging --clients 200
 */
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { assertNotProduction, percentile, serviceToken, signInMany } from './sessions';

/** Default pass mark for a fresh account's first complete checkpoint; `--p95-ms` overrides it. */
export const INITIAL_SYNC_P95_MS = 5_000;

/** Reads NDJSON lines until a `checkpoint_complete`; returns the time it took, or throws. */
export async function timeToCheckpoint(
  syncUrl: string,
  token: string,
  timeoutMs: number,
): Promise<number> {
  const started = Date.now();
  const response = await fetch(`${syncUrl}/sync/stream`, {
    method: 'POST',
    headers: { authorization: `Token ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      buckets: [],
      include_checksum: true,
      raw_data: true,
      client_id: randomUUID(),
      streams: { include_defaults: true, subscriptions: [] },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) throw new Error(`sync stream ${response.status}`);
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true });
    if (hasCheckpointComplete(buffer)) {
      await response.body.cancel().catch(() => undefined);
      return Date.now() - started;
    }
    buffer = buffer.slice(Math.max(0, buffer.lastIndexOf('\n')));
  }
  throw new Error('stream ended before a complete checkpoint');
}

export function hasCheckpointComplete(ndjson: string): boolean {
  return ndjson.split('\n').some((line) => line.startsWith('{"checkpoint_complete"'));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      staging: { type: 'boolean', default: false },
      clients: { type: 'string', default: '100' },
      timeout: { type: 'string', default: '60000' },
      'p95-ms': { type: 'string', default: String(INITIAL_SYNC_P95_MS) },
    },
  });
  if (!values.staging) throw new Error('pass --staging');
  const apiBase = (process.env.API_BASE_URL ?? '').replace(/\/$/u, '');
  const syncUrl = (process.env.POWERSYNC_URL ?? '').replace(/\/$/u, '');
  if (!apiBase || !syncUrl) throw new Error('API_BASE_URL and POWERSYNC_URL are required');
  assertNotProduction(apiBase);
  assertNotProduction(syncUrl);

  const sessions = await signInMany(apiBase, Number(values.clients));
  const tokens = await Promise.all(sessions.map((s) => serviceToken(apiBase, s, 'sync')));
  const results = await Promise.allSettled(
    tokens.map((token) => timeToCheckpoint(syncUrl, token, Number(values.timeout))),
  );
  const times = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  const failures = results.length - times.length;
  const p95 = percentile(times, 95);
  console.log(
    JSON.stringify({ clients: results.length, failures, p50: percentile(times, 50), p95 }, null, 2),
  );
  process.exitCode = failures === 0 && p95 !== undefined && p95 <= Number(values['p95-ms']) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
