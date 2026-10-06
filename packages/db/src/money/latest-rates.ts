/**
 * The latest exchange rates, as every money path reads them: the newest rate of each pair (the
 * source dates each currency on its own, so the newest day's rows are rarely a complete set),
 * pinned on the row quoting the trip's currency (else the first) so a calc can store which run it
 * priced with. The caller passes its currency check, so the codes come back in its own type.
 */
import type pg from 'pg';

export interface LatestRate<C extends string> {
  readonly base: C;
  readonly quote: C;
  /** Exact decimal string as stored (`numeric(20,10)`), never a JS number. */
  readonly rate: string;
  /** Calendar date (`YYYY-MM-DD`) the rate is effective for. */
  readonly asOf: string;
  readonly source: string;
}

export interface LatestRates<C extends string> {
  /** The `fx_snapshots` row the rates are pinned on. */
  readonly snapshotId: string;
  readonly snapshots: readonly LatestRate<C>[];
}

/** `null` when no rate has been ingested yet. */
export async function readLatestRates<C extends string>(
  tx: pg.PoolClient,
  currency: string,
  asCurrency: (code: string) => C,
): Promise<LatestRates<C> | null> {
  const { rows } = await tx.query<{
    id: string;
    base: string;
    quote: string;
    rate: string;
    as_of: string;
    source: string;
  }>(
    `SELECT id, base, quote, rate, as_of, source FROM (
       SELECT DISTINCT ON (base, quote) id, base, quote, rate::text AS rate, as_of::text AS as_of,
              source
         FROM fx_snapshots ORDER BY base, quote, as_of DESC, created_at DESC
     ) newest ORDER BY quote, source`,
  );
  const pinned = rows.find((row) => row.quote === currency) ?? rows[0];
  if (pinned === undefined) return null;
  return {
    snapshotId: pinned.id,
    snapshots: rows.map((row) => ({
      base: asCurrency(row.base),
      quote: asCurrency(row.quote),
      rate: row.rate,
      asOf: row.as_of,
      source: row.source,
    })),
  };
}
