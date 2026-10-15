/**
 * Prunes the open-data place index to the lean rule (docs/product-decisions.md D38,
 * docs/data-model.md §3.13 "Lean place index"): deletes `pois` rows that are not in the kept set
 * (`loadKeptPoiIds`), not editorial, and either fail the lean rule (`leanPlaceSql`) or belong to a
 * destination not in use: none of `USED_DESTINATIONS_SQL` (trips, stops, recent pitches) and not
 * curated (`CURATED_DESTINATIONS_SQL`: a loaded itinerary or a place with a curated note). A
 * curated destination is planned from its open-data places too, so they stay.
 *
 * Before the first delete the table is dumped to the backup bucket (`ops.backup`'s dump, of
 * `pois` only, under `PRUNE_DUMP_PREFIX`); a rerun the same day keeps that first dump instead of
 * replacing it with a half-pruned one. Rows go in batches by id with a pause between, so other
 * writers keep their turn; `place_cards` follow through their trigger, and the place's own shadows
 * (embeddings, live checks, Foursquare ids and photos, rating stats) by cascade. A reference made
 * while the prune runs stops it at the foreign key and the batch rolls back; a rerun reads the
 * kept set again. A dry run reports the counts only.
 *
 * Runs on the pool's own login role: the kept set has to read every table, which row security
 * would filter for `app_system`.
 */
import { leanPlaceSql, loadKeptPoiIds, USED_DESTINATIONS_SQL, USED_WINDOW_DAYS } from '@cp/db';
import type pg from 'pg';

import type { JobLogger } from '../boss/define-job';
import { runBackup } from '../jobs/ops/backup';
import type { ObjectStore } from '../jobs/ops/object-store';

export const PRUNE_BATCH_SIZE = 50_000;
export const PRUNE_PAUSE_MS = 2_000;
export const PRUNE_DUMP_PREFIX = 'postgres/pois-prune/';

export interface PruneDump {
  readonly databaseUrl: string;
  readonly store: ObjectStore;
  /** Argv that runs pg_dump. */
  readonly pgDump: readonly string[];
}

export interface PruneOptions {
  readonly dryRun: boolean;
  readonly logger: JobLogger;
  /** Where the pre-prune dump goes; a real run refuses to start without it. */
  readonly dump?: PruneDump | undefined;
  readonly batchSize?: number;
  readonly pauseMs?: number;
  readonly signal?: AbortSignal;
  readonly now?: Date;
}

export interface PruneSize {
  readonly rows: number;
  readonly bytes: number;
}

export interface PruneResult {
  readonly dryRun: boolean;
  readonly before: PruneSize;
  /** Rows that fail the lean rule or belong to a destination not in use (editorial left out). */
  readonly candidates: number;
  /** Candidates something references, which stay. */
  readonly keptCandidates: number;
  /** Rows deleted; in a dry run, the rows a real run would delete. */
  readonly deleted: number;
  readonly kept: number;
  readonly keptByColumn: Readonly<Record<string, number>>;
  readonly usedDestinations: number;
  readonly dumpKey: string | null;
  /** Row count and size after the deletes; null in a dry run. */
  readonly after: PruneSize | null;
}

async function tableSize(pool: pg.Pool): Promise<PruneSize> {
  const { rows } = await pool.query<{ rows: string; bytes: string }>(
    "SELECT (SELECT count(*) FROM pois) AS rows, pg_total_relation_size('public.pois') AS bytes",
  );
  return { rows: Number(rows[0]?.rows ?? 0), bytes: Number(rows[0]?.bytes ?? 0) };
}

/** A row the prune may delete, with `$1` the ids of the destinations in use. */
function candidateSql(alias = 'p'): string {
  return `${alias}.curation <> 'editorial'
    AND (NOT (${alias}.destination_id = ANY ($1::uuid[])) OR NOT ${leanPlaceSql(alias)})`;
}

/** Dumps `pois` before the first delete of the day; returns the dump's key. */
async function dumpOnce(dump: PruneDump, logger: JobLogger, now: Date): Promise<string> {
  const key = `${PRUNE_DUMP_PREFIX}${now.toISOString().slice(0, 10)}.dump`;
  const existing = await dump.store.list(PRUNE_DUMP_PREFIX);
  if (existing.includes(key)) {
    logger.info({ key }, 'places prune keeps the dump taken earlier today');
    return key;
  }
  const result = await runBackup({
    databaseUrl: dump.databaseUrl,
    store: dump.store,
    logger,
    pgDump: [...dump.pgDump, '--table=public.pois'],
    prefix: PRUNE_DUMP_PREFIX,
    now,
  });
  return result.key;
}

/** Destinations with curated content: a loaded itinerary, or a place carrying a curated note. */
export const CURATED_DESTINATIONS_SQL = `
  SELECT destination_id FROM destination_itineraries
  UNION
  SELECT DISTINCT destination_id FROM pois
   WHERE editorial ? 'curated' AND destination_id IS NOT NULL`;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function prunePlaces(pool: pg.Pool, options: PruneOptions): Promise<PruneResult> {
  const { logger } = options;
  const batchSize = options.batchSize ?? PRUNE_BATCH_SIZE;
  if (!options.dryRun && options.dump === undefined) {
    throw new Error('a places prune needs the backup bucket for its dump first');
  }
  const before = await tableSize(pool);
  const kept = await loadKeptPoiIds(pool);
  const { rows: usedRows } = await pool.query<{ id: string }>(
    `${USED_DESTINATIONS_SQL} UNION ${CURATED_DESTINATIONS_SQL}`,
    [USED_WINDOW_DAYS],
  );
  const used = usedRows.map((row) => row.id);
  const keptIds = [...kept.ids];
  const { rows: counts } = await pool.query<{ candidates: string; kept: string }>(
    `SELECT count(*) AS candidates, count(*) FILTER (WHERE p.id = ANY ($2::uuid[])) AS kept
       FROM pois p WHERE ${candidateSql('p')}`,
    [used, keptIds],
  );
  const candidates = Number(counts[0]?.candidates ?? 0);
  const keptCandidates = Number(counts[0]?.kept ?? 0);
  const summary = {
    before,
    candidates,
    keptCandidates,
    kept: kept.ids.size,
    keptByColumn: kept.byColumn,
    usedDestinations: used.length,
  };
  logger.info(summary, 'places prune counted');
  if (options.dryRun || options.dump === undefined) {
    return {
      dryRun: true,
      ...summary,
      deleted: candidates - keptCandidates,
      dumpKey: null,
      after: null,
    };
  }

  const dumpKey = await dumpOnce(options.dump, logger, options.now ?? new Date());
  let cursor = '00000000-0000-0000-0000-000000000000';
  let deleted = 0;
  for (;;) {
    if (options.signal?.aborted === true) throw new Error('places prune aborted');
    const { rows } = await pool.query<{ id: string }>(
      `SELECT p.id::text AS id FROM pois p
        WHERE p.id > $2::uuid AND ${candidateSql('p')}
        ORDER BY p.id LIMIT $3`,
      [used, cursor, batchSize],
    );
    const last = rows.at(-1);
    if (last === undefined) break;
    cursor = last.id;
    const ids = rows.map((row) => row.id).filter((id) => !kept.ids.has(id));
    if (ids.length > 0) {
      const result = await pool.query(
        "DELETE FROM pois WHERE id = ANY ($1::uuid[]) AND curation <> 'editorial'",
        [ids],
      );
      deleted += result.rowCount ?? 0;
    }
    logger.info({ deleted, cursor }, 'places prune batch');
    if (rows.length < batchSize) break;
    await pause(options.pauseMs ?? PRUNE_PAUSE_MS);
  }
  await pool
    .query('VACUUM (ANALYZE) pois')
    .catch((error: unknown) => logger.warn({ err: error }, 'places prune could not vacuum pois'));
  const after = await tableSize(pool);
  logger.info({ deleted, after, dumpKey }, 'places prune finished');
  return { dryRun: false, ...summary, deleted, dumpKey, after };
}
