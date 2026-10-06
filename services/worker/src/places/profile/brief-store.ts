/**
 * Reads and writes of `destination_briefs` for the brief run, and its stay bands written to
 * `destination_cost_indices` as web estimates (docs/product-decisions.md D30): one row per tier,
 * per person on a shared-room basis, left unreviewed, and never over a row a person wrote or
 * approved. An editorial brief is never written by a run.
 */
import type { StayBand, StayTier } from '@cp/ai';
import { assertCurrencyCode, currencyExponent } from '@cp/cost-engine';
import { MIN_CURATED_PLACES, pickCoverage, withSystem } from '@cp/db';
import type pg from 'pg';

/** A brief is written again after this. */
export const BRIEF_TTL_DAYS = 90;

export interface BriefTarget {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly status: string | null;
  readonly origin: string | null;
  readonly expiresAt: Date | null;
  readonly curated: boolean;
}

export async function loadBriefTarget(
  pool: pg.Pool,
  destinationId: string,
): Promise<BriefTarget | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      slug: string;
      name: string;
      country: string | null;
      status: string | null;
      origin: string | null;
      expires_at: Date | null;
    }>(
      `SELECT d.id, d.slug, d.name, d.country, b.status, b.origin, b.expires_at
         FROM destinations d LEFT JOIN destination_briefs b ON b.destination_id = d.id
        WHERE d.id = $1`,
      [destinationId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    const coverage = await pickCoverage(tx, row.id);
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      country: row.country,
      status: row.status,
      origin: row.origin,
      expiresAt: row.expires_at,
      curated: coverage.curated >= MIN_CURATED_PLACES,
    };
  });
}

export async function briefSpentTodayMicros(pool: pg.Pool, now: Date): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ micros: string }>(
      `SELECT coalesce(sum(cost_micros), 0)::text AS micros FROM destination_briefs
        WHERE requested_at >= date_trunc('day', $1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [now],
    );
    return Number(rows[0]?.micros ?? 0);
  });
}

/** Starts a run: a new row is pending; a ready brief stays readable while it is rewritten. */
export async function markBriefStarted(pool: pg.Pool, id: string, now: Date): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO destination_briefs (destination_id, status, requested_at, updated_at)
       VALUES ($1, 'pending', $2, $2)
       ON CONFLICT (destination_id) DO UPDATE
          SET requested_at = $2, updated_at = $2, error = NULL, cost_micros = 0
        WHERE destination_briefs.origin = 'ai'`,
      [id, now],
    ),
  );
}

/** Ends a run that wrote nothing: a ready brief keeps its content. */
export async function markBriefEnded(
  pool: pg.Pool,
  id: string,
  end: { status: 'declined' | 'failed'; error: string; model: string | null; costMicros: number },
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE destination_briefs
          SET status = CASE WHEN status = 'ready' THEN status ELSE $2 END, error = $3,
              model = coalesce($4, model), cost_micros = cost_micros + $5, updated_at = now()
        WHERE destination_id = $1 AND origin = 'ai'`,
      [id, end.status, end.error, end.model, end.costMicros],
    ),
  );
}

export interface StoredEssential {
  readonly poi_id: string;
  readonly rank: number;
  readonly why: Readonly<Record<string, string>>;
  readonly sources: readonly { url: string; title: string; quote: string }[];
}

export interface StoredEatery {
  readonly poi_id: string;
  readonly dish: string | null;
  readonly why: Readonly<Record<string, string>>;
  readonly sources: readonly { url: string; title: string; quote: string }[];
}

export interface BriefContent {
  readonly essentials: readonly StoredEssential[];
  readonly eateries: readonly StoredEatery[];
  readonly stays: readonly StayBand[];
  readonly dropped: readonly unknown[];
  readonly model: string;
  readonly costMicros: number;
  readonly timings: Readonly<Record<string, number>>;
}

export async function saveBrief(
  tx: pg.PoolClient,
  id: string,
  content: BriefContent,
  now: Date,
): Promise<void> {
  await tx.query(
    `UPDATE destination_briefs
        SET status = 'ready', essentials = $2, eateries = $3, stays = $4, dropped = $5, model = $6,
            cost_micros = cost_micros + $7, timings = $8, error = NULL, generated_at = $9::timestamptz,
            expires_at = $9::timestamptz + make_interval(days => $10::int), updated_at = $9
      WHERE destination_id = $1 AND origin = 'ai'`,
    [
      id,
      JSON.stringify(content.essentials),
      JSON.stringify(content.eateries),
      JSON.stringify(content.stays),
      JSON.stringify(content.dropped),
      content.model,
      content.costMicros,
      JSON.stringify(content.timings),
      now,
      BRIEF_TTL_DAYS,
    ],
  );
}

/** The cost index stay type a brief tier is stored as. */
export const TIER_STAY_TYPE: Readonly<Record<StayTier, string>> = {
  budget: 'guesthouse',
  mid: 'hotel',
  upscale: 'resort',
};

/** Marks the rows this run writes; only such rows, still unreviewed, are ever replaced. */
export const WEB_ESTIMATE = 'Web estimate';

/** One room a night (major units) as per person minor units, two people to a room. */
export function perPersonMinor(roomMajor: number, currency: string): number {
  const exponent = currencyExponent(assertCurrencyCode(currency));
  return Math.round((roomMajor / 2) * 10 ** exponent);
}

export function stayEstimateSource(band: StayBand, on: string): string {
  const host = new URL(band.source.url).hostname.replace(/^www\./u, '');
  return `${WEB_ESTIMATE} (${on}, per person, two to a room) from ${host}: "${band.source.quote.slice(0, 300)}"`;
}

export async function saveStayEstimates(
  tx: pg.PoolClient,
  destinationId: string,
  stays: readonly StayBand[],
  now: Date,
): Promise<number> {
  const on = now.toISOString().slice(0, 10);
  let written = 0;
  for (const band of stays) {
    let low: number;
    let high: number;
    try {
      low = perPersonMinor(band.low, band.currency);
      high = perPersonMinor(band.high, band.currency);
    } catch {
      continue; // A currency the cost engine does not know is not an estimate we can use.
    }
    const result = await tx.query(
      `INSERT INTO destination_cost_indices
         (destination_id, stay_type, nightly_minor_low, nightly_minor_high, food_pp_day_minor,
          fun_pp_day_minor, currency, source, source_url, sourced_on)
       VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7, $8)
       ON CONFLICT (destination_id, stay_type) DO UPDATE
          SET nightly_minor_low = EXCLUDED.nightly_minor_low,
              nightly_minor_high = EXCLUDED.nightly_minor_high, currency = EXCLUDED.currency,
              source = EXCLUDED.source, source_url = EXCLUDED.source_url,
              sourced_on = EXCLUDED.sourced_on
        WHERE destination_cost_indices.reviewed_at IS NULL
          AND destination_cost_indices.source LIKE $9`,
      [
        destinationId,
        TIER_STAY_TYPE[band.tier],
        low,
        high,
        band.currency,
        stayEstimateSource(band, on),
        band.source.url,
        on,
        `${WEB_ESTIMATE}%`,
      ],
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

/** Adds one language's lines to a ready brief; false when it has them or is gone. */
export async function saveBriefTranslation(
  pool: pg.Pool,
  id: string,
  locale: string,
  lines: ReadonlyMap<string, string>,
  costMicros: number,
): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ essentials: StoredEssential[]; eateries: StoredEatery[] }>(
      `SELECT essentials, eateries FROM destination_briefs
        WHERE destination_id = $1 AND status = 'ready' FOR UPDATE`,
      [id],
    );
    const row = rows[0];
    if (row === undefined) return false;
    const add = <T extends { why: Readonly<Record<string, string>> }>(entry: T, key: string): T => {
      const line = lines.get(key);
      return line === undefined ? entry : { ...entry, why: { ...entry.why, [locale]: line } };
    };
    await tx.query(
      `UPDATE destination_briefs SET essentials = $2, eateries = $3,
              cost_micros = cost_micros + $4, updated_at = now()
        WHERE destination_id = $1`,
      [
        id,
        JSON.stringify(row.essentials.map((e, i) => add(e, `e${i}`))),
        JSON.stringify(row.eateries.map((e, i) => add(e, `f${i}`))),
        costMicros,
      ],
    );
    return true;
  });
}
