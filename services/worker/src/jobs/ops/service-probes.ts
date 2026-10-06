/**
 * The health collector's probes (./service-health.ts): our own services answered directly (api and
 * PowerSync health endpoints, Centrifugo's server API, Redis PING, the worker heartbeats, SearXNG,
 * each database's size and WAL against its disk), and a vendor's public Statuspage feed. A probe
 * that throws or times out is `down`; one that is not configured writes nothing.
 */
import { withSystem } from '@cp/db';
import {
  WORKER_HEARTBEAT_KEY_PREFIX,
  WORKER_HEARTBEAT_SET,
  statuspageState,
  type ServiceState,
} from '@cp/domain';
import type pg from 'pg';

const PROBE_TIMEOUT_MS = 5000;
/** Disk use at which a database row turns degraded, and down. */
export const DISK_DEGRADED_PCT = 80;
export const DISK_DOWN_PCT = 95;

export interface HealthRedis {
  hGetAll(key: string): Promise<Record<string, string>>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  get(key: string): Promise<string | null>;
  sMembers(key: string): Promise<string[]>;
  exists(keys: string[]): Promise<number>;
  ping(): Promise<string>;
}

export interface ServiceHealthEnv {
  readonly API_INTERNAL_URL?: string | undefined;
  readonly POWERSYNC_URL?: string | undefined;
  readonly POWERSYNC_STORAGE_VOLUME_GB?: number | undefined;
  readonly DATABASE_STORAGE_LIMIT_GB?: number | undefined;
  readonly CENTRIFUGO_API_URL?: string | undefined;
  readonly CENTRIFUGO_HTTP_API_KEY?: string | undefined;
  readonly SEARXNG_URL?: string | undefined;
}

export interface ServiceHealthDeps {
  readonly pool: pg.Pool;
  readonly redis: HealthRedis;
  readonly env: ServiceHealthEnv;
  /** PowerSync's bucket-storage database; unset = its disk row stays unknown. */
  readonly storagePool?: pg.Pool | undefined;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: Date;
}

export interface Snapshot {
  readonly service: string;
  readonly state: ServiceState;
  readonly p95_ms: number | null;
  readonly error_rate: number | null;
  readonly quota_used_pct: number | null;
  readonly calls: number | null;
}

export const snapshot = (
  service: string,
  state: ServiceState,
  extra: Partial<Snapshot> = {},
): Snapshot => ({
  service,
  state,
  p95_ms: null,
  error_rate: null,
  quota_used_pct: null,
  calls: null,
  ...extra,
});

/** Runs `check`; ok with its latency when it resolves, down when it throws or times out. */
async function timed(service: string, check: () => Promise<unknown>): Promise<Snapshot> {
  const started = performance.now();
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timed out')), PROBE_TIMEOUT_MS).unref(),
      ),
    ]);
    return snapshot(service, 'ok', { p95_ms: Math.round(performance.now() - started) });
  } catch {
    return snapshot(service, 'down');
  }
}

async function httpOk(fetcher: typeof globalThis.fetch, url: string, init?: RequestInit) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}

const join = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

/** Disk use as a share of the volume, and the state it implies. */
export function diskState(usedBytes: number, limitGb: number | undefined) {
  if (limitGb === undefined || limitGb <= 0) return { state: 'ok' as const, pct: null };
  const pct = Math.round((usedBytes / (limitGb * 1e9)) * 10_000) / 100;
  const state: ServiceState =
    pct >= DISK_DOWN_PCT ? 'down' : pct >= DISK_DEGRADED_PCT ? 'degraded' : 'ok';
  return { state, pct };
}

async function databaseDisk(
  service: string,
  query: (sql: string) => Promise<{ rows: { bytes: string | null }[] }>,
  limitGb: number | undefined,
): Promise<Snapshot> {
  const started = performance.now();
  try {
    const size = await query('SELECT pg_database_size(current_database())::text AS bytes');
    let bytes = Number(size.rows[0]?.bytes ?? 0);
    // The WAL lives on the same disk; reading it needs pg_monitor, so it is added when allowed.
    const wal = await query(
      'SELECT coalesce(sum(size), 0)::text AS bytes FROM pg_ls_waldir()',
    ).catch(() => null);
    bytes += Number(wal?.rows[0]?.bytes ?? 0);
    const disk = diskState(bytes, limitGb);
    return snapshot(service, disk.state, {
      p95_ms: Math.round(performance.now() - started),
      quota_used_pct: disk.pct,
    });
  } catch {
    return snapshot(service, 'down');
  }
}

export async function probeOwnServices(deps: ServiceHealthDeps, fetcher: typeof globalThis.fetch) {
  const { env, redis } = deps;
  const probes: Promise<Snapshot>[] = [
    timed('redis', () => redis.ping()),
    timed('worker', async () => {
      const instances = await redis.sMembers(WORKER_HEARTBEAT_SET);
      const live =
        instances.length === 0
          ? 0
          : await redis.exists(
              instances.map((instance) => `${WORKER_HEARTBEAT_KEY_PREFIX}${instance}`),
            );
      if (live === 0) throw new Error('no live worker');
    }),
    databaseDisk(
      'planetscale',
      (sql) => withSystem(deps.pool, (tx) => tx.query(sql)),
      env.DATABASE_STORAGE_LIMIT_GB,
    ),
  ];
  if (env.API_INTERNAL_URL !== undefined) {
    const url = join(env.API_INTERNAL_URL, '/health');
    probes.push(timed('api', () => httpOk(fetcher, url)));
  }
  if (env.POWERSYNC_URL !== undefined) {
    const url = join(env.POWERSYNC_URL, '/probes/liveness');
    probes.push(timed('powersync', () => httpOk(fetcher, url)));
  }
  if (deps.storagePool !== undefined) {
    const storage = deps.storagePool;
    probes.push(
      databaseDisk(
        'powersync_storage',
        (sql) => storage.query(sql),
        env.POWERSYNC_STORAGE_VOLUME_GB,
      ),
    );
  }
  if (env.CENTRIFUGO_API_URL !== undefined && env.CENTRIFUGO_HTTP_API_KEY !== undefined) {
    const url = join(env.CENTRIFUGO_API_URL, '/api/info');
    const key = env.CENTRIFUGO_HTTP_API_KEY;
    probes.push(
      timed('centrifugo', async () => {
        const reply = (await (
          await httpOk(fetcher, url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': key },
            body: '{}',
          })
        ).json()) as { error?: unknown };
        if (reply.error !== undefined) throw new Error('centrifugo info failed');
      }),
    );
  }
  if (env.SEARXNG_URL !== undefined) {
    const url = join(env.SEARXNG_URL, '/healthz');
    probes.push(timed('searxng', () => httpOk(fetcher, url)));
  }
  return Promise.all(probes);
}

export const STATUSPAGES: Readonly<Record<string, string>> = {
  cloudflare: 'https://www.cloudflarestatus.com/api/v2/status.json',
  revenuecat: 'https://status.revenuecat.com/api/v2/status.json',
  resend: 'https://resend-status.com/api/v2/status.json',
};

export async function statuspage(
  fetcher: typeof globalThis.fetch,
  url: string,
): Promise<ServiceState> {
  try {
    const body = (await (await httpOk(fetcher, url)).json()) as {
      status?: { indicator?: unknown };
    };
    return statuspageState(body.status?.indicator);
  } catch {
    return 'unknown';
  }
}
