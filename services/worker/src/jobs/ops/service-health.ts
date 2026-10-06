/**
 * `ops.service_health` (every minute): one snapshot per monitored service into `ops.service_health`,
 * which the console's Services & spend screen reads. Our own services are probed (api and
 * PowerSync health endpoints, Centrifugo's server API, Redis PING, the worker heartbeats, SearXNG,
 * the two databases' disk use); vendors are judged from the outbound call counters every api and
 * worker process writes to Redis, plus the free Statuspage feed where a vendor has one. A service
 * with no evidence this tick gets no row, so the screen shows `unknown` once its last row is stale;
 * nothing is ever guessed. Rows older than 30 days are deleted.
 */
import { withSystem } from '@cp/db';
import {
  CALL_WINDOW_MINUTES,
  SERVICES,
  callCountKey,
  callLatencyKey,
  epochMinute,
  judgeCalls,
  quotaKey,
  worstState,
  type CallMinute,
} from '@cp/domain';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import {
  STATUSPAGES,
  probeOwnServices,
  snapshot,
  statuspage,
  type HealthRedis,
  type ServiceHealthDeps,
  type Snapshot,
} from './service-probes';

export type { HealthRedis, ServiceHealthDeps, ServiceHealthEnv, Snapshot } from './service-probes';

export const SERVICE_HEALTH_QUEUE = 'ops.service_health';

async function readCalls(redis: HealthRedis, service: string, now: Date): Promise<CallMinute[]> {
  const last = epochMinute(now);
  const minutes = Array.from({ length: CALL_WINDOW_MINUTES }, (_, index) => last - index);
  return Promise.all(
    minutes.map(async (minute) => {
      const [counts, latencies] = await Promise.all([
        redis.hGetAll(callCountKey(service, minute)),
        redis.lRange(callLatencyKey(service, minute), 0, -1),
      ]);
      return {
        calls: Number(counts['calls'] ?? 0),
        errors: Number(counts['errors'] ?? 0),
        latencies: latencies.map(Number).filter(Number.isFinite),
      };
    }),
  );
}

const quotaSchema = z.object({ pct: z.number() });

async function readQuota(redis: HealthRedis, service: string): Promise<number | null> {
  const raw = await redis.get(quotaKey(service));
  if (raw === null) return null;
  const parsed = quotaSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data.pct : null;
}

/** One collector tick; returns the snapshots it wrote. */
export async function collectServiceHealth(deps: ServiceHealthDeps): Promise<Snapshot[]> {
  const now = deps.now ?? new Date();
  const fetcher = deps.fetch ?? globalThis.fetch;
  const own = await probeOwnServices(deps, fetcher);
  const byService = new Map(own.map((row) => [row.service, row]));

  const baselines = await withSystem(deps.pool, (tx) =>
    tx.query<{ service: string; p95: number | null }>(
      `SELECT service, percentile_cont(0.5) WITHIN GROUP (ORDER BY p95_ms) AS p95
         FROM ops.service_health
        WHERE at > $1::timestamptz - interval '24 hours' AND state = 'ok' AND p95_ms IS NOT NULL
        GROUP BY service`,
      [now],
    ),
  );
  const baseline = new Map(baselines.rows.map((row) => [row.service, row.p95]));

  for (const entry of SERVICES) {
    if (byService.has(entry.key) || entry.derived_from !== undefined) continue;
    const calls =
      entry.hosts === undefined
        ? null
        : judgeCalls(await readCalls(deps.redis, entry.key, now), baseline.get(entry.key) ?? null);
    const page = STATUSPAGES[entry.key];
    const status = page === undefined ? 'unknown' : await statuspage(fetcher, page);
    const quota = entry.usage_api === true ? await readQuota(deps.redis, entry.key) : null;
    const state = worstState([status, calls?.state ?? 'unknown']);
    if (state === 'unknown' && quota === null) continue;
    byService.set(
      entry.key,
      snapshot(entry.key, state, {
        p95_ms: calls === null || calls.p95_ms === null ? null : Math.round(calls.p95_ms),
        error_rate: calls === null ? null : Math.round(calls.error_rate * 100_000) / 100_000,
        calls: calls?.calls ?? null,
        quota_used_pct: quota,
      }),
    );
  }
  for (const entry of SERVICES) {
    if (entry.derived_from === undefined) continue;
    const states = entry.derived_from.map((key) => byService.get(key)?.state ?? 'unknown');
    const state = worstState(states);
    if (state !== 'unknown') byService.set(entry.key, snapshot(entry.key, state));
  }

  const rows = [...byService.values()];
  await withSystem(deps.pool, async (tx) => {
    if (rows.length > 0) {
      await tx.query(
        `INSERT INTO ops.service_health (service, at, state, p95_ms, error_rate, quota_used_pct, calls)
         SELECT r.service, $2::timestamptz, r.state, r.p95_ms, r.error_rate, r.quota_used_pct, r.calls
           FROM jsonb_to_recordset($1::jsonb) AS r(service text, state text, p95_ms int,
                error_rate numeric, quota_used_pct numeric, calls int)
         ON CONFLICT (service, at) DO NOTHING`,
        [JSON.stringify(rows), now],
      );
    }
    await tx.query(
      "DELETE FROM ops.service_health WHERE at < $1::timestamptz - interval '30 days'",
      [now],
    );
  });
  return rows;
}

export function serviceHealthJob(deps: Omit<ServiceHealthDeps, 'pool' | 'now'>): AnyJobDefinition {
  return defineJob({
    queue: SERVICE_HEALTH_QUEUE,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      const rows = await collectServiceHealth({ ...deps, pool });
      return {
        written: rows.length,
        attention: rows.filter((row) => row.state !== 'ok').map((row) => row.service),
      };
    },
  });
}
