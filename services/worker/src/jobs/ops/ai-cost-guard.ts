/**
 * `ops.ai_cost_guard` (every 5 min): sums today's (UTC) AI spend per tier and this month's total
 * from `ai_usage`, against the caps in `ops.ops_config` (`ai.cap.daily_usd`,
 * `ai.cap.<tier>.daily_usd`, `spend.month_budget_usd`; a missing cap is no cap). At 80 % of a cap it
 * alerts once per day; at 100 % it pauses the tier (or every tier for the daily total and the monthly
 * budget) until the day ends. It never re-routes a call to another model: a paused route answers
 * `switched_off` and the app shows its fallback. Each new pause writes an `ops.admin_audit` row
 * (system actor), and every run stores its result in `ops.ai_cost_guard` for the console's
 * "guard OK" status.
 */
import { withSystem } from '@cp/db';
import { AI_TIERS, GENERATION_TIERS } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition, type JobLogger } from '../../boss/define-job';

export const AI_COST_GUARD_QUEUE = 'ops.ai_cost_guard';
export const AI_COST_GUARD_STATE_KEY = 'ops.ai_cost_guard';
export const AI_COST_ALERT_RATIO = 0.8;

export interface CostAlert {
  readonly cap: string;
  readonly level: 'warn' | 'pause';
  readonly spend_usd: number;
  readonly cap_usd: number;
}

export type CostAlertSink = (alert: CostAlert) => void;

export interface GuardState {
  readonly day: string;
  readonly last_run_at: string;
  readonly ok: boolean;
  readonly spend_usd: Readonly<Record<string, number>>;
  readonly month_usd: number;
  /** Tiers paused for `day`; `all` pauses every tier. */
  readonly paused: readonly string[];
  /** `<cap>:<level>` already alerted for `day`. */
  readonly alerted: readonly string[];
}

const stateSchema = z.object({
  day: z.string(),
  paused: z.array(z.string()).default([]),
  alerted: z.array(z.string()).default([]),
});

const usd = (micros: string | number | null | undefined) => Number(micros ?? 0) / 1_000_000;

async function readCaps(tx: pg.PoolClient): Promise<Map<string, number>> {
  const { rows } = await tx.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM ops.ops_config
     WHERE key = 'spend.month_budget_usd' OR key LIKE 'ai.cap.%'`,
  );
  return new Map(
    rows.flatMap((row) =>
      typeof row.value === 'number' && row.value >= 0 ? [[row.key, row.value] as const] : [],
    ),
  );
}

/** One guard tick; returns the stored state. */
export async function runAiCostGuard(
  pool: pg.Pool,
  options: { readonly now?: Date; readonly alert?: CostAlertSink } = {},
): Promise<GuardState> {
  const now = options.now ?? new Date();
  const day = now.toISOString().slice(0, 10);
  const { state, alerts } = await withSystem(pool, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [AI_COST_GUARD_QUEUE]);
    const caps = await readCaps(tx);
    const spend = await tx.query<{ tier: string; micros: string }>(
      `SELECT tier, sum(cost_micros)::text AS micros FROM ai_usage
       WHERE at >= $1::date AND at < $1::date + 1 GROUP BY tier`,
      [day],
    );
    const month = await tx.query<{ micros: string | null }>(
      `SELECT sum(cost_micros)::text AS micros FROM ai_usage
       WHERE at >= date_trunc('month', $1::date) AND at < $1::date + 1`,
      [day],
    );
    const perTier = Object.fromEntries(AI_TIERS.map((tier) => [tier, 0])) as Record<string, number>;
    for (const row of spend.rows) perTier[row.tier] = usd(row.micros);
    const total = Object.values(perTier).reduce((a, b) => a + b, 0);
    const monthUsd = usd(month.rows[0]?.micros);

    const previous = await tx.query<{ value: unknown }>(
      'SELECT value FROM ops.ops_config WHERE key = $1',
      [AI_COST_GUARD_STATE_KEY],
    );
    const stored = stateSchema.safeParse(previous.rows[0]?.value);
    const today = stored.success && stored.data.day === day ? stored.data : null;
    const paused = new Set(today?.paused ?? []);
    const alerted = new Set(today?.alerted ?? []);
    const raised: CostAlert[] = [];
    const newlyPaused: { cap: string; tiers: string[] }[] = [];

    const checks: { cap: string; spent: number; tiers: string[] }[] = [
      { cap: 'ai.cap.daily_usd', spent: total, tiers: ['all'] },
      { cap: 'spend.month_budget_usd', spent: monthUsd, tiers: ['all'] },
      ...GENERATION_TIERS.map((tier) => ({
        cap: `ai.cap.${tier}.daily_usd`,
        spent: perTier[tier] ?? 0,
        tiers: [tier],
      })),
    ];
    for (const { cap, spent, tiers } of checks) {
      const limit = caps.get(cap);
      if (limit === undefined) continue;
      const level = spent >= limit ? 'pause' : spent >= limit * AI_COST_ALERT_RATIO ? 'warn' : null;
      if (level === null) continue;
      if (!alerted.has(`${cap}:${level}`)) {
        alerted.add(`${cap}:${level}`);
        raised.push({ cap, level, spend_usd: spent, cap_usd: limit });
      }
      if (level === 'pause') {
        const fresh = tiers.filter((tier) => !paused.has(tier));
        for (const tier of fresh) paused.add(tier);
        if (fresh.length > 0) newlyPaused.push({ cap, tiers: fresh });
      }
    }

    for (const pause of newlyPaused) {
      await tx.query(
        `INSERT INTO ops.admin_audit (admin_id, action, target_kind, reason, detail)
         VALUES (NULL, 'ai_cost_guard.pause', 'config', $1, $2)`,
        [
          `${pause.cap} reached`,
          JSON.stringify({
            key: pause.cap,
            summary: `Paused AI ${pause.tiers.join(', ')} for ${day}`,
            changes: pause.tiers.map((tier) => ({
              field: `tier.${tier}`,
              before: 'on',
              after: 'paused',
            })),
            via: 'system',
          }),
        ],
      );
    }
    const next: GuardState = {
      day,
      last_run_at: now.toISOString(),
      ok: paused.size === 0,
      spend_usd: perTier,
      month_usd: monthUsd,
      paused: [...paused].sort(),
      alerted: [...alerted].sort(),
    };
    await tx.query(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ($1, $2::jsonb, false)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [AI_COST_GUARD_STATE_KEY, JSON.stringify(next)],
    );
    return { state: next, alerts: raised };
  });
  for (const alert of alerts) options.alert?.(alert);
  return state;
}

/** Alerts go to the error log (Sentry and the on-call route pick errors up). */
export function logCostAlerts(logger: JobLogger): CostAlertSink {
  return (alert) =>
    logger.error({ alert: 'ai_cost', ...alert }, `AI spend ${alert.level}: ${alert.cap}`);
}

export function aiCostGuardJob(): AnyJobDefinition {
  return defineJob({
    queue: AI_COST_GUARD_QUEUE,
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const state = await runAiCostGuard(pool, { alert: logCostAlerts(logger) });
      return { ok: state.ok, paused: state.paused, spend_usd: state.spend_usd };
    },
  });
}
