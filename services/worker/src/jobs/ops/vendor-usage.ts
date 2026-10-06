/**
 * `ops.vendor_usage` (hourly): reads usage from the vendors that report it and stores it where the
 * console reads it. Quota use goes to Redis (`ops:quota:<service>`, two hours), which the health
 * collector copies into each snapshot; billed spend goes to `ops.vendor_spend_daily` with source
 * `api`. Tavily answers credits used against the plan and pay-as-you-go credits; Foursquare's
 * monthly call count is our own reservation table against `FOURSQUARE_MONTHLY_CALL_CAP`. AI spend
 * is not polled: the console sums `ai_usage` per vendor when it reads.
 */
import { withSystem } from '@cp/db';
import { quotaKey } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

export const VENDOR_USAGE_QUEUE = 'ops.vendor_usage';
const QUOTA_TTL_SECONDS = 2 * 60 * 60;
/** Tavily's pay-as-you-go price per credit (tavily.com/pricing). */
export const TAVILY_PAYGO_MICROS_PER_CREDIT = 8000;
const TAVILY_USAGE_URL = 'https://api.tavily.com/usage';

export interface UsageRedis {
  set(key: string, value: string, options: { EX: number }): Promise<unknown>;
}

export interface VendorUsageDeps {
  readonly pool: pg.Pool;
  readonly redis: UsageRedis;
  readonly env: {
    readonly TAVILY_API_KEY?: string | undefined;
    readonly FOURSQUARE_MONTHLY_CALL_CAP: number;
  };
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: Date;
}

const tavilyUsageSchema = z.object({
  key: z.object({ usage: z.number(), limit: z.number().nullable().optional() }).optional(),
  account: z
    .object({
      current_plan: z.string().optional(),
      plan_usage: z.number(),
      plan_limit: z.number(),
      paygo_usage: z.number().optional(),
    })
    .optional(),
});

const pct = (used: number, limit: number) => Math.round((used / limit) * 10_000) / 100;

async function storeQuota(redis: UsageRedis, service: string, value: number, now: Date) {
  await redis.set(quotaKey(service), JSON.stringify({ pct: value, at: now.toISOString() }), {
    EX: QUOTA_TTL_SECONDS,
  });
}

async function pollTavily(deps: VendorUsageDeps, apiKey: string, now: Date) {
  const response = await (deps.fetch ?? globalThis.fetch)(TAVILY_USAGE_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`tavily usage HTTP ${response.status}`);
  const usage = tavilyUsageSchema.parse(await response.json());
  const account = usage.account;
  const quota =
    account !== undefined && account.plan_limit > 0
      ? pct(account.plan_usage, account.plan_limit)
      : typeof usage.key?.limit === 'number' && usage.key.limit > 0
        ? pct(usage.key.usage, usage.key.limit)
        : null;
  if (quota !== null) await storeQuota(deps.redis, 'tavily', quota, now);
  const paygo = account?.paygo_usage ?? 0;
  if (paygo > 0) {
    const month = now.toISOString().slice(0, 7);
    await withSystem(deps.pool, (tx) =>
      tx.query(
        `INSERT INTO ops.vendor_spend_daily (service, day, amount_micros, currency, source, note)
         VALUES ('tavily', ($1 || '-01')::date, $2, 'USD', 'api', $3)
         ON CONFLICT (service, day, source) DO UPDATE SET
           amount_micros = EXCLUDED.amount_micros, note = EXCLUDED.note, updated_at = now()`,
        [
          month,
          paygo * TAVILY_PAYGO_MICROS_PER_CREDIT,
          `${paygo} pay-as-you-go credits this cycle at $0.008`,
        ],
      ),
    );
  }
  return { quota, paygo };
}

async function pollFoursquare(deps: VendorUsageDeps, now: Date) {
  const month = now.toISOString().slice(0, 7);
  const { rows } = await withSystem(deps.pool, (tx) =>
    tx.query<{ calls: number }>(
      `SELECT (details_calls + match_calls + search_calls)::int AS calls
         FROM foursquare_api_usage WHERE month = $1`,
      [month],
    ),
  );
  const quota = pct(rows[0]?.calls ?? 0, deps.env.FOURSQUARE_MONTHLY_CALL_CAP);
  await storeQuota(deps.redis, 'foursquare', quota, now);
  return quota;
}

/** One poll; a vendor that fails is reported and the others still run. */
export async function pollVendorUsage(deps: VendorUsageDeps) {
  const now = deps.now ?? new Date();
  const result: Record<string, unknown> = {};
  const failed: string[] = [];
  const apiKey = deps.env.TAVILY_API_KEY;
  if (apiKey !== undefined) {
    try {
      result['tavily'] = await pollTavily(deps, apiKey, now);
    } catch {
      failed.push('tavily');
    }
  }
  try {
    result['foursquare'] = await pollFoursquare(deps, now);
  } catch {
    failed.push('foursquare');
  }
  return { ...result, failed };
}

export function vendorUsageJob(deps: Omit<VendorUsageDeps, 'pool' | 'now'>): AnyJobDefinition {
  return defineJob({
    queue: VENDOR_USAGE_QUEUE,
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const outcome = await pollVendorUsage({ ...deps, pool });
      if (outcome.failed.length > 0)
        logger.warn({ failed: outcome.failed }, 'vendor usage poll failed');
      return outcome;
    },
  });
}
