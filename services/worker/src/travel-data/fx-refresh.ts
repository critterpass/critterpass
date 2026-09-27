/**
 * `fx.refresh` (docs/api-contracts-async.md §2.3, hourly at :15): Frankfurter rates against EUR for
 * every currency the app shows: live destinations' local currencies, travellers' home currencies
 * and USD (fares are priced in USD). Uses the FX ingest (src/fx/ingest.ts): immutable snapshots,
 * one per (base, quote, day, source), so hourly runs after the day's rate is stored are no-ops.
 */
import { isKnownCurrency } from '@cp/cost-engine';
import { withSystem } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../boss/define-job';
import { createPgFxSnapshotWriter, ingestFxSnapshots } from '../fx/ingest';

export const FX_BASE = 'EUR';

export async function fxQuoteCurrencies(tx: pg.PoolClient): Promise<string[]> {
  const { rows } = await tx.query<{ code: string }>(
    `SELECT DISTINCT upper(currency) AS code FROM destinations WHERE currency IS NOT NULL
     UNION
     SELECT DISTINCT upper(home_currency) FROM users WHERE home_currency IS NOT NULL`,
  );
  const codes = new Set(['USD', ...rows.map((row) => row.code)]);
  codes.delete(FX_BASE);
  return [...codes].filter((code) => isKnownCurrency(code)).sort();
}

export function fxRefreshJob(): AnyJobDefinition {
  return defineJob({
    queue: 'fx.refresh',
    schema: z.object({}).nullish(),
    async handler(_data, { pool, logger }) {
      const quotes = await withSystem(pool, fxQuoteCurrencies);
      const result = await ingestFxSnapshots(createPgFxSnapshotWriter(pool), {
        base: FX_BASE,
        quotes,
      });
      const report = { ...result, rejected: result.rejected.length, quotes: quotes.length };
      if (result.stale) logger.warn(report, 'fx rates are stale');
      else logger.info(report, 'fx refreshed');
      return report;
    },
  });
}
