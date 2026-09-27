/**
 * The pinned FX rate shape `convert.ts` operates on (docs/data-model.md §3.8's `fx_snapshots`
 * table, mirrored here rather than imported from `@cp/db`: this package stays pure/no-I/O, so the
 * worker maps a DB row into this shape before calling into it).
 */
import { type CurrencyCode } from '../money/currencies';

export interface FxSnapshot {
  readonly base: CurrencyCode;
  /** 1 unit of `base` equals `rate` units of `quote`. */
  readonly quote: CurrencyCode;
  /** Exact decimal string (`numeric(20,10)` as stored) — never a JS `number`. */
  readonly rate: string;
  /** Calendar date (`YYYY-MM-DD`) the rate is effective for. */
  readonly asOf: string;
  readonly source: string;
}

const DEFAULT_STALE_THRESHOLD_HOURS = 48;

/**
 * A snapshot is stale once its `asOf` date is more than `thresholdHours` behind `now` (default 48h,
 * docs/product-decisions.md's FX staleness rule) — a display-only flag ("rates from {date}"), not a
 * reason to refuse a conversion: the alternative is no rate at all.
 */
export function isStaleSnapshot(
  snapshot: FxSnapshot,
  now: Date,
  thresholdHours: number = DEFAULT_STALE_THRESHOLD_HOURS,
): boolean {
  const asOfMs = Date.parse(`${snapshot.asOf}T00:00:00Z`);
  return now.getTime() - asOfMs > thresholdHours * 60 * 60 * 1000;
}
