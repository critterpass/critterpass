/**
 * FX ingest job handler (docs/product-decisions.md's FX rule; cron registration is a later
 * phase). Orchestration is independent of Postgres — `FxSnapshotWriter` is the only I/O seam, so
 * `ingest.test.ts` proves idempotency and rejection handling without Docker; the real
 * `ON CONFLICT ... DO NOTHING` guarantee itself is proven against a live Postgres by
 * `packages/db/test/permissions/fx_snapshots.test.ts`.
 */
import { isKnownCurrency } from '@cp/cost-engine';
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { fetchFxRates, type FrankfurterClientOptions } from './frankfurter';

export interface FxSnapshotRow {
  readonly base: string;
  readonly quote: string;
  readonly rate: string;
  readonly asOf: string;
  readonly source: string;
}

export interface FxSnapshotWriter {
  /** Idempotent upsert; `inserted: false` means the row already existed (same rate, not overwritten). */
  upsertSnapshot(row: FxSnapshotRow): Promise<{ readonly inserted: boolean }>;
}

export interface IngestFxSnapshotsInput {
  readonly base: string;
  readonly quotes: readonly string[];
  /** Omit for the latest available rates. */
  readonly date?: string;
  /** Default `'frankfurter'`. */
  readonly source?: string;
}

export interface IngestFxSnapshotsOptions extends FrankfurterClientOptions {
  readonly now?: Date;
  /** Default 48h (docs/product-decisions.md's FX rule). */
  readonly staleThresholdHours?: number;
}

export interface RejectedRate {
  readonly quote: string;
  readonly reason: string;
}

export interface IngestFxSnapshotsResult {
  readonly fetched: number;
  readonly inserted: number;
  readonly skipped: number;
  readonly rejected: readonly RejectedRate[];
  readonly latestAsOf: string | null;
  /** True when the freshest fetched rate is still older than the staleness threshold. */
  readonly stale: boolean;
}

const DEFAULT_STALE_THRESHOLD_HOURS = 48;

/**
 * Fetches `input.quotes` against `input.base` and upserts each into `writer`, skipping (not
 * failing) any currency pair `@cp/cost-engine` does not recognise — Frankfurter's currency set and
 * Critterpass's are independently maintained, so a mismatch is data to report, not a reason to
 * abort every other currency in the same batch.
 */
export async function ingestFxSnapshots(
  writer: FxSnapshotWriter,
  input: IngestFxSnapshotsInput,
  options: IngestFxSnapshotsOptions = {},
): Promise<IngestFxSnapshotsResult> {
  const source = input.source ?? 'frankfurter';
  const rates = await fetchFxRates(
    {
      base: input.base,
      quotes: input.quotes,
      ...(input.date !== undefined ? { date: input.date } : {}),
    },
    options,
  );

  let inserted = 0;
  let skipped = 0;
  let latestAsOf: string | null = null;
  const rejected: RejectedRate[] = [];

  for (const rate of rates) {
    if (!isKnownCurrency(rate.base) || !isKnownCurrency(rate.quote)) {
      rejected.push({ quote: rate.quote, reason: 'unknown_currency' });
      continue;
    }
    const result = await writer.upsertSnapshot({
      base: rate.base,
      quote: rate.quote,
      rate: rate.rate,
      asOf: rate.date,
      source,
    });
    if (result.inserted) {
      inserted += 1;
    } else {
      skipped += 1;
    }
    if (latestAsOf === null || rate.date > latestAsOf) {
      latestAsOf = rate.date;
    }
  }

  const now = options.now ?? new Date();
  const thresholdHours = options.staleThresholdHours ?? DEFAULT_STALE_THRESHOLD_HOURS;
  const stale =
    latestAsOf === null ||
    now.getTime() - Date.parse(`${latestAsOf}T00:00:00Z`) > thresholdHours * 60 * 60 * 1000;

  return { fetched: rates.length, inserted, skipped, rejected, latestAsOf, stale };
}

/**
 * The real `FxSnapshotWriter`: an idempotent upsert as `app_system` (fx_snapshots has no `app_user`
 * write grant — packages/db/migrations/*_fx_snapshots.sql). `DO NOTHING` rather than `DO UPDATE`:
 * a snapshot is an immutable historical fact once referenced elsewhere by id.
 */
export function createPgFxSnapshotWriter(pool: pg.Pool): FxSnapshotWriter {
  return {
    async upsertSnapshot(row) {
      return withSystem(pool, async (tx) => {
        const result = await tx.query(
          `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (base, quote, as_of, source) DO NOTHING`,
          [row.base, row.quote, row.rate, row.asOf, row.source],
        );
        return { inserted: (result.rowCount ?? 0) > 0 };
      });
    },
  };
}
