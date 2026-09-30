/**
 * The AeroDataBox plan's limits, held across every worker: a monthly call budget (UTC calendar
 * month) and at most one call per second. Both read the `ops.supplier_calls` audit, where every
 * attempt lands (successes and failures alike) before the call returns. A transaction-scoped
 * advisory lock serialises callers, so the count and the last call's time a caller reads under the
 * lock already include every earlier call. A spent budget or a 429 reads as "no reading": the
 * flight keeps its scheduled times and the job completes without retrying.
 */
import { withSystem } from '@cp/db';
import { AERODATABOX_SUPPLIER, SupplierHttpError } from '@cp/suppliers';
import type pg from 'pg';

import type { JobLogger } from '../../boss';

export const DEFAULT_ADB_MONTHLY_CALLS = 380;
const MIN_SPACING_MS = 1000;
const LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtextextended('supplier_calls:aerodatabox', 0))`;

export interface AdbGateOptions {
  readonly monthlyCalls: number;
  /** Minimum gap between two calls; defaults to the plan's one per second. */
  readonly spacingMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface AdbGate {
  /** Runs `call` inside the budget and pacing; `[]` when the budget is spent or the plan answers 429. */
  run<T>(call: () => Promise<T[]>, logger?: Pick<JobLogger, 'warn'>): Promise<T[]>;
}

export function adbMonthlyCallsFromEnv(
  source: Readonly<Record<string, string | undefined>>,
): number {
  const raw = Number(source['AERODATABOX_MONTHLY_CALLS']);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_ADB_MONTHLY_CALLS;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAdbGate(pool: pg.Pool, options: AdbGateOptions): AdbGate {
  const spacingMs = options.spacingMs ?? MIN_SPACING_MS;
  const sleep = options.sleep ?? defaultSleep;
  let spentLoggedOn: string | undefined;

  return {
    run: (call, logger) =>
      withSystem(pool, async (tx) => {
        await tx.query(LOCK_SQL);
        const { rows } = await tx.query<{ used: number; since_ms: number | null }>(
          `SELECT count(*) FILTER (WHERE at >= date_trunc('month', clock_timestamp(), 'UTC'))::int AS used,
                  (extract(epoch FROM clock_timestamp() - max(at)) * 1000)::float8 AS since_ms
             FROM ops.supplier_calls
            WHERE supplier = $1
              AND at >= date_trunc('month', clock_timestamp(), 'UTC') - interval '1 minute'`,
          [AERODATABOX_SUPPLIER],
        );
        const used = rows[0]?.used ?? 0;
        if (used >= options.monthlyCalls) {
          const today = new Date().toISOString().slice(0, 10);
          if (spentLoggedOn !== today) {
            spentLoggedOn = today;
            logger?.warn(
              { supplier: AERODATABOX_SUPPLIER, used, limit: options.monthlyCalls },
              'aerodatabox monthly budget is spent: flights keep their scheduled times',
            );
          }
          return [];
        }
        const sinceMs = rows[0]?.since_ms ?? null;
        if (sinceMs !== null && sinceMs < spacingMs) await sleep(spacingMs - sinceMs);
        try {
          return await call();
        } catch (error) {
          if (error instanceof SupplierHttpError && error.status === 429) {
            logger?.warn(
              { supplier: AERODATABOX_SUPPLIER, status: 429 },
              'aerodatabox is rate limiting: no reading this check',
            );
            return [];
          }
          throw error;
        }
      }),
  };
}
