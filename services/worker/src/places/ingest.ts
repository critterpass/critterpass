/**
 * Curated POI ingest for one destination bbox: reads Overture places and FSQ OS Places
 * (`./source-readers.ts`), conflates them (`./conflate.ts`), and upserts into `pois` keyed by
 * source id so a rerun updates existing rows instead of creating new ones. Upserts are batched
 * (`INGEST_BATCH_SIZE` conflated POIs per chunk, one transaction, one existing-id lookup plus one
 * multi-row `INSERT` and one multi-row `UPDATE`): a metro-wide bbox against a remote Postgres would
 * otherwise turn into tens of thousands of sequential round trips.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

import { chunk } from './batch-sql';
import { conflatePlaces, type ConflationCandidate } from './conflate';
import {
  batchUpsertConflatedPois,
  INGEST_BATCH_SIZE,
  type EditorialOverlayInput,
} from './ingest-upsert';
import {
  fsqOsSource,
  readFsqOsPlaces,
  readOverturePlaces,
  type BoundingBox,
  type PlaceSourceReader,
  type PlaceSourceRow,
} from './source-readers';

export { editorialOverlayKey, type EditorialOverlayInput } from './ingest-upsert';

export {
  readFsqOsPlaces,
  readOverturePlaces,
  type BoundingBox,
  type PlaceSourceReader,
  type PlaceSourceRow,
} from './source-readers';

function toCandidate(row: PlaceSourceRow): ConflationCandidate {
  return {
    sourceId: row.sourceId,
    name: row.name,
    categoryLabels: row.categoryLabels,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    confidence: row.confidence,
    website: row.website,
    phone: row.phone,
    brand: row.brand,
  };
}

const SPARSE_COVERAGE_THRESHOLD = 50;

export interface IngestDestinationInput {
  readonly destinationId: string;
  readonly bbox: BoundingBox;
  readonly timezone?: string;
  /** Content-factory editorial overlays (that pipeline is not built yet), keyed by `editorialOverlayKey`. */
  readonly editorialBySourceKey?: ReadonlyMap<string, EditorialOverlayInput>;
}

export interface IngestSources {
  readonly readOverturePlaces?: PlaceSourceReader;
  readonly readFsqOsPlaces?: PlaceSourceReader;
}

export interface IngestDestinationResult {
  /** Rows read from each source for the bbox. */
  readonly overtureRows: number;
  readonly fsqOsRows: number;
  /** Inserted plus updated. */
  readonly upserted: number;
  readonly inserted: number;
  readonly updated: number;
  /** New low-confidence places left out. */
  readonly skipped: number;
  /** Places inside this bbox another destination already owns; left untouched. */
  readonly ownedElsewhere: number;
  readonly activeCount: number;
  /** True when the real FSQ OS Places source was used and returned nothing because it is gated. */
  readonly fsqOsGated: boolean;
  /** Triggers the "no curated places yet" UI state: fewer than 50 active POIs after this ingest. */
  readonly sparseCoverage: boolean;
}

/** Ingests one destination bbox: reads both sources, conflates, and upserts (see file header). */
export async function ingestDestination(
  pool: pg.Pool,
  input: IngestDestinationInput,
  sources: IngestSources = {},
): Promise<IngestDestinationResult> {
  const readOverture = sources.readOverturePlaces ?? readOverturePlaces;
  const readFsq = sources.readFsqOsPlaces ?? readFsqOsPlaces;
  const usingRealFsqReader = sources.readFsqOsPlaces === undefined;

  // One source at a time: each read holds its own DuckDB instance and memory budget.
  const overtureRows = await readOverture(input.bbox);
  const fsqRows = await readFsq(input.bbox);
  const fsqOsGated = usingRealFsqReader && fsqRows.length === 0 && fsqOsSource() === 'none';

  const conflated = conflatePlaces(fsqRows.map(toCandidate), overtureRows.map(toCandidate));

  const counts = { inserted: 0, updated: 0, skipped: 0, ownedElsewhere: 0 };
  for (const batch of chunk(conflated, INGEST_BATCH_SIZE)) {
    const batchCounts = await batchUpsertConflatedPois(
      pool,
      input.destinationId,
      input.timezone,
      batch,
      input.editorialBySourceKey,
    );
    counts.inserted += batchCounts.inserted;
    counts.updated += batchCounts.updated;
    counts.skipped += batchCounts.skipped;
    counts.ownedElsewhere += batchCounts.ownedElsewhere;
  }

  const activeCount = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ count: string }>(
      "SELECT count(*) FROM pois WHERE destination_id = $1 AND status = 'active'",
      [input.destinationId],
    );
    return Number(rows[0]?.count ?? 0);
  });

  return {
    overtureRows: overtureRows.length,
    fsqOsRows: fsqRows.length,
    upserted: counts.inserted + counts.updated,
    ...counts,
    activeCount,
    fsqOsGated,
    sparseCoverage: activeCount < SPARSE_COVERAGE_THRESHOLD,
  };
}

export interface AttributionNoticeInput {
  readonly destinationSlug: string;
  readonly overtureRelease: string;
  readonly fsqOsIncluded: boolean;
  readonly generatedAt: Date;
}

/**
 * NOTICE text for one destination's ingest: Apache-2.0 requires FSQ OS Places attribution when
 * included; CDLA-P-2.0 requires crediting Overture regardless.
 */
export function generateAttributionNotice(input: AttributionNoticeInput): string {
  const lines = [
    `# Attribution: ${input.destinationSlug}`,
    '',
    `Generated ${input.generatedAt.toISOString()}.`,
    '',
    `- Map data (c) OpenStreetMap contributors and Overture Maps Foundation, release ${input.overtureRelease}, licensed under CDLA-Permissive-2.0 (https://cdla.dev/permissive-2-0/).`,
  ];
  if (input.fsqOsIncluded) {
    lines.push(
      '- Places data (c) Foursquare Labs, Inc., from FSQ OS Places, licensed under Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0). This product includes software developed by Foursquare Labs, Inc. (https://foursquare.com).',
    );
  }
  return `${lines.join('\n')}\n`;
}
