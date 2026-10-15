/**
 * What the curated loader does with a destination that has too few places (`SPARSE_PLACES`).
 * The open-data ingest is queued only when it can still add something, so a re-run never waits on
 * an ingest forever:
 *
 * - an ingest of the destination is queued or running: wait for it (`ingest_running`);
 * - none has finished (or the queue's records of it are gone): queue the on-demand ingest under
 *   the api's key (`on-demand-ingest:<slug>`);
 * - the last one finished with enough places but they are gone now (a prune removed them):
 *   queue it once more, keyed by that run, so each lost run is redone once at most;
 * - the last one finished sparse (the place is small), or the queue refuses the job because the
 *   same key ran inside its window: load against the places there are, and send the unmatched
 *   lines to the OpenStreetMap lookup.
 */
import { sendInTx, withSystem } from '@cp/db';
import { PLACES_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { BOSS_SCHEMA } from '../../boss/boss';
import { PLACES_INGEST_TILE_QUEUE } from '../../jobs/places/ingest-tile';

/** Fewer active places than this and the destination is ingested first (as on demand). */
export const SPARSE_PLACES = 50;
/** The api's on-demand ingest key and retry window, so the two never queue the same slug twice. */
const INGEST_RETRY_SECONDS = 7 * 24 * 3_600;

export interface IngestState {
  /** An ingest of the destination (or one of its tiles) is queued or running. */
  readonly running: boolean;
  /** The last finished ingest run: its id and the active places it counted at the end. */
  readonly last: { readonly runId: string; readonly activeCount: number } | null;
}

export type SparseStep =
  | { readonly kind: 'wait' }
  | { readonly kind: 'queue'; readonly singletonKey: string }
  | { readonly kind: 'load' };

/** The step for a sparse destination given its ingest state (see the file header). */
export function sparseStep(slug: string, state: IngestState): SparseStep {
  if (state.running) return { kind: 'wait' };
  if (state.last === null) return { kind: 'queue', singletonKey: `on-demand-ingest:${slug}` };
  if (state.last.activeCount >= SPARSE_PLACES) {
    return { kind: 'queue', singletonKey: `on-demand-ingest:${slug}:${state.last.runId}` };
  }
  return { kind: 'load' };
}

/** The destination's ingest jobs as the job queue records them. */
export async function ingestState(pool: pg.Pool, slug: string): Promise<IngestState> {
  return withSystem(pool, async (tx) => {
    const { rows: running } = await tx.query(
      `SELECT 1 FROM ${BOSS_SCHEMA}.job
        WHERE name = ANY ($1::text[]) AND data->>'slug' = $2
          AND state IN ('created', 'retry', 'active')
        LIMIT 1`,
      [[PLACES_QUEUES.ingest, PLACES_INGEST_TILE_QUEUE], slug],
    );
    const { rows: finished } = await tx.query<{ run_id: string; active_count: string | null }>(
      `SELECT data->>'runId' AS run_id, output->>'activeCount' AS active_count
         FROM ${BOSS_SCHEMA}.job
        WHERE name = $1 AND data->>'slug' = $2 AND data->>'stage' = 'finish'
          AND state = 'completed'
        ORDER BY completed_on DESC
        LIMIT 1`,
      [PLACES_INGEST_TILE_QUEUE, slug],
    );
    const last = finished[0];
    return {
      running: running.length > 0,
      last:
        last === undefined
          ? null
          : { runId: last.run_id, activeCount: Number(last.active_count ?? 0) },
    };
  });
}

export type SparseOutcome = 'ingest_running' | 'ingest_queued' | 'load';

/**
 * Decides and, unless `dryRun`, queues the ingest for a sparse destination. `load` means the
 * caller loads against the places there are.
 */
export async function handleSparse(
  pool: pg.Pool,
  slug: string,
  options: { readonly dryRun: boolean },
): Promise<SparseOutcome> {
  const step = sparseStep(slug, await ingestState(pool, slug));
  if (step.kind === 'wait') return 'ingest_running';
  if (step.kind === 'load') return 'load';
  if (options.dryRun) return 'ingest_queued';
  const id = await withSystem(pool, (tx) =>
    sendInTx(
      tx,
      PLACES_QUEUES.ingest,
      { slug },
      { singletonKey: step.singletonKey, singletonSeconds: INGEST_RETRY_SECONDS },
    ),
  );
  // Refused: the same ingest ran inside its window, so waiting for it again would never end.
  return id === null ? 'load' : 'ingest_queued';
}
