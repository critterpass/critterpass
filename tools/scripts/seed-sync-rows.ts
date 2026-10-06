/**
 * Reads what a simulated traveller's phone would hold: the rows the sync service sends that
 * account, over the same stream the app opens (a short-lived `aud: sync` token, then
 * `POST /sync/stream`). The seed scripts use it to learn ids the api only hands out through sync
 * (the trip a crew code joined, the day's leave-by), so a simulated traveller can act on them with
 * real commands.
 */
import { randomUUID } from 'node:crypto';

import type { ApiClient, ApiSession } from './seed-trip-day';

/** Staging's sync service, as the e2e-test build is configured (apps/mobile/eas.json). */
export const DEFAULT_SYNC_URL = 'https://powersync-api-staging.up.railway.app';

export interface StreamSubscription {
  readonly stream: string;
  readonly parameters: Readonly<Record<string, string>>;
}

export type SyncedRow = Readonly<Record<string, unknown>> & { readonly id: string };

interface SyncLine {
  readonly data?: {
    readonly data?: readonly {
      readonly op: string;
      readonly object_type?: string;
      readonly object_id?: string;
      readonly data?: string | Record<string, unknown> | null;
    }[];
  };
  readonly checkpoint_complete?: unknown;
}

async function syncToken(api: ApiClient, who: ApiSession): Promise<string> {
  const response = await api.fetch(`${api.baseUrl}/api/auth/token?aud=sync`, {
    headers: { cookie: who.cookie },
  });
  const body = (await response.json()) as { token?: string };
  if (!response.ok || body.token === undefined) {
    throw new Error(`sync token: HTTP ${String(response.status)}`);
  }
  return body.token;
}

/** Folds one stream line into `rows`; true once the first full checkpoint has arrived. */
export function applySyncLine(line: string, table: string, rows: Map<string, SyncedRow>): boolean {
  const parsed = JSON.parse(line) as SyncLine;
  for (const entry of parsed.data?.data ?? []) {
    if (entry.object_type !== table || entry.object_id === undefined) continue;
    if (entry.op === 'REMOVE') rows.delete(entry.object_id);
    if (entry.op !== 'PUT' || entry.data === null || entry.data === undefined) continue;
    const data =
      typeof entry.data === 'string'
        ? (JSON.parse(entry.data) as Record<string, unknown>)
        : entry.data;
    rows.set(entry.object_id, { ...data, id: entry.object_id });
  }
  return parsed.checkpoint_complete !== undefined;
}

/**
 * Every row of `table` the account holds after its first full sync, with `subscriptions` added to
 * the streams every account gets. Gives up after `timeoutMs`.
 */
export async function readSyncedRows(
  api: ApiClient,
  who: ApiSession,
  table: string,
  options: {
    readonly syncUrl?: string;
    readonly subscriptions?: readonly StreamSubscription[];
    readonly timeoutMs?: number;
  } = {},
): Promise<SyncedRow[]> {
  const token = await syncToken(api, who);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 60_000);
  const rows = new Map<string, SyncedRow>();
  try {
    const response = await api.fetch(`${options.syncUrl ?? DEFAULT_SYNC_URL}/sync/stream`, {
      method: 'POST',
      signal: abort.signal,
      headers: { 'content-type': 'application/json', authorization: `Token ${token}` },
      body: JSON.stringify({
        buckets: [],
        include_checksum: true,
        raw_data: true,
        client_id: randomUUID(),
        streams: {
          include_defaults: true,
          subscriptions: (options.subscriptions ?? []).map((subscription) => ({
            ...subscription,
            override_priority: null,
          })),
        },
      }),
    });
    if (!response.ok || response.body === null) {
      throw new Error(`sync stream: HTTP ${String(response.status)}`);
    }
    const decoder = new TextDecoder();
    let buffered = '';
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffered += decoder.decode(chunk, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() !== '' && applySyncLine(line, table, rows)) return [...rows.values()];
      }
    }
    throw new Error('sync stream ended before its first checkpoint');
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

/** Polls `readSyncedRows` until `pick` finds its row; throws after `attempts` full syncs. */
export async function waitForSyncedRow(
  read: () => Promise<SyncedRow[]>,
  pick: (rows: readonly SyncedRow[]) => SyncedRow | undefined,
  what: string,
  attempts = 12,
  pauseMs = 5_000,
): Promise<SyncedRow> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const found = pick(await read());
    if (found !== undefined) return found;
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
  throw new Error(`${what} never arrived through sync`);
}
