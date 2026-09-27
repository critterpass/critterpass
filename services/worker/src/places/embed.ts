/**
 * POI embeddings job, run on change: the pgvector search-ranking branch stays flag-gated until the
 * founder picks an embedding vendor. No vendor is chosen yet, so this ships as a real, working
 * pipeline that is a total no-op — zero reads beyond the one row needed, zero writes — whenever it
 * is disabled or has no vendor configured, which is every environment until that decision lands.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

/** Whatever embedding vendor the founder eventually picks implements this; none exists yet. */
export interface EmbeddingVendor {
  readonly model: string;
  embed(texts: readonly string[]): Promise<ReadonlyArray<readonly number[]>>;
}

export interface EmbedPoiOptions {
  readonly enabled: boolean;
  readonly vendor?: EmbeddingVendor;
}

export interface EmbedPoiResult {
  readonly embedded: number;
  readonly skipped: boolean;
}

const NOOP_RESULT: EmbedPoiResult = { embedded: 0, skipped: true };

function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Embeds one POI's searchable text (name + local name + tags) and upserts `poi_embeddings`.
 * A no-op whenever `options.enabled` is false or no vendor is configured.
 */
export async function embedPoi(
  pool: pg.Pool,
  poiId: string,
  options: EmbedPoiOptions,
): Promise<EmbedPoiResult> {
  if (!options.enabled || options.vendor === undefined) return NOOP_RESULT;
  const vendor = options.vendor;

  const poi = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ name: string; name_local: string | null; tags: string[] }>(
      'SELECT name, name_local, tags FROM pois WHERE id = $1',
      [poiId],
    );
    return rows[0];
  });
  if (poi === undefined) return NOOP_RESULT;

  const text = [poi.name, poi.name_local, ...poi.tags]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
  const [embedding] = await vendor.embed([text]);
  if (embedding === undefined) return NOOP_RESULT;

  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO poi_embeddings (poi_id, model, embedding) VALUES ($1, $2, $3)
       ON CONFLICT (poi_id) DO UPDATE SET model = EXCLUDED.model, embedding = EXCLUDED.embedding, updated_at = now()`,
      [poiId, vendor.model, toVectorLiteral(embedding)],
    ),
  );
  return { embedded: 1, skipped: false };
}

/** Embeds every active POI in a destination (e.g. after an ingest run); a no-op under the same conditions. */
export async function embedPoisForDestination(
  pool: pg.Pool,
  destinationId: string,
  options: EmbedPoiOptions,
): Promise<EmbedPoiResult> {
  if (!options.enabled || options.vendor === undefined) return NOOP_RESULT;

  const poiIds = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "SELECT id FROM pois WHERE destination_id = $1 AND status = 'active'",
      [destinationId],
    );
    return rows.map((row) => row.id);
  });

  let embedded = 0;
  for (const poiId of poiIds) {
    // Sequential on purpose: this runs after a monthly ingest, not on a latency-sensitive path, and
    // most vendor embedding APIs rate-limit per-key regardless of client-side concurrency.
    const result = await embedPoi(pool, poiId, options);
    embedded += result.embedded;
  }
  return { embedded, skipped: poiIds.length === 0 };
}
