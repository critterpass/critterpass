/**
 * What the curated loader does before it matches a destination: makes sure the open-data places
 * the curated lines need are there. The ingest is queued only when it can still add something,
 * and every ingest is keyed so a re-run never waits on one forever nor queues it twice:
 *
 * - an ingest of the destination is queued or running: wait for it (`ingest_running`);
 * - the destination's place box was just redrawn around its curated points (`./bounds.ts`): queue
 *   the ingest of that box, keyed by the slug and the box (`on-demand-ingest:<slug>:<box>`);
 * - sparse (fewer than `SPARSE_PLACES`) and no ingest has finished (or the queue's records of
 *   it are gone): queue the on-demand ingest under the api's key (`on-demand-ingest:<slug>`);
 * - thin (fewer than `PLACES_PER_LINE` places per curated line) and no ingest on record, as after a
 *   prune took a destination nobody used yet: queue the ingest of its box, under the box key;
 * - otherwise, or when the queue refuses every key because the same ingest ran inside its window,
 *   load against the places there are and send the unmatched lines to the OpenStreetMap lookup.
 *   When a sparse destination's last run had finished with enough places that are gone now (a
 *   prune removed them), that run is queued once more beside the load, keyed by the run, so each
 *   lost run is redone once at most and a later pass matches against its places.
 */
import { sendInTx, withSystem } from '@cp/db';
import { PLACES_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { BOSS_SCHEMA } from '../../boss/boss';
import { PLACES_INGEST_TILE_QUEUE } from '../../jobs/places/ingest-tile';
import { setPlaceBounds } from '../place-bounds';
import type { BoundingBox } from '../source-readers';
import { boxKey } from './bounds';

/** Fewer active places than this and the destination is ingested first (as on demand). */
export const SPARSE_PLACES = 50;
/** Fewer active places per curated line than this, with no ingest on record, is a thin box. */
export const PLACES_PER_LINE = 10;
/** The api's on-demand ingest retry window, which every key here shares. */
const INGEST_RETRY_SECONDS = 7 * 24 * 3_600;

/** Below this many active places a destination of `lines` curated lines is thin. */
export const thinBelow = (lines: number) => Math.max(SPARSE_PLACES, PLACES_PER_LINE * lines);

export interface IngestState {
  /** An ingest of the destination (or one of its tiles) is queued or running. */
  readonly running: boolean;
  /** The last finished ingest run: its id and the active places it counted at the end. */
  readonly last: { readonly runId: string; readonly activeCount: number } | null;
}

export interface PlacesState {
  /** Active places, counted up to `thinBelow(lines)`. */
  readonly active: number;
  /** Curated lines in the file. */
  readonly lines: number;
  /** The destination's place box, or the box redrawn around its curated points. */
  readonly box: BoundingBox | null;
  /** `box` is redrawn, and written before its ingest is queued. */
  readonly boxRedrawn: boolean;
}

export type SparseStep =
  | { readonly kind: 'wait' }
  /** Queue under the first key the queue accepts; if it accepts none, load (and redo). */
  | { readonly kind: 'queue'; readonly keys: readonly string[]; readonly redoKey: string | null }
  | { readonly kind: 'load'; readonly redoKey: string | null };

/** Whether the destination needs its ingest state read at all. */
export const needsIngestCheck = (places: PlacesState) =>
  places.boxRedrawn || places.active < thinBelow(places.lines);

/** The step for a destination given its places and ingest state (see the file header). */
export function sparseStep(slug: string, places: PlacesState, state: IngestState): SparseStep {
  if (state.running) return { kind: 'wait' };
  const sparse = places.active < SPARSE_PLACES;
  const boxRun = `on-demand-ingest:${slug}:${boxKey(places.box)}`;
  const keys = new Set<string>(places.boxRedrawn ? [boxRun] : []);
  const { last } = state;
  if (last === null && sparse) keys.add(`on-demand-ingest:${slug}`);
  else if (last === null && places.active < thinBelow(places.lines)) keys.add(boxRun);
  const lost = sparse && last !== null && last.activeCount >= SPARSE_PLACES;
  const redoKey = lost ? `on-demand-ingest:${slug}:${last.runId}` : null;
  return keys.size > 0 ? { kind: 'queue', keys: [...keys], redoKey } : { kind: 'load', redoKey };
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

export type SparseOutcome =
  | { readonly status: 'ingest_running' | 'ingest_queued' }
  | { readonly status: 'load'; readonly reingestQueued: boolean };

const queueIngest = (pool: pg.Pool, slug: string, singletonKey: string) =>
  withSystem(pool, (tx) =>
    sendInTx(
      tx,
      PLACES_QUEUES.ingest,
      { slug },
      { singletonKey, singletonSeconds: INGEST_RETRY_SECONDS },
    ),
  );

/**
 * Decides and, unless `dryRun`, queues the destination's ingest (see the file header). `load`
 * means the caller loads against the places there are.
 */
export async function handleSparse(
  pool: pg.Pool,
  slug: string,
  places: PlacesState,
  options: { readonly dryRun: boolean },
): Promise<SparseOutcome> {
  if (!needsIngestCheck(places)) return { status: 'load', reingestQueued: false };
  const step = sparseStep(slug, places, await ingestState(pool, slug));
  if (step.kind === 'wait') return { status: 'ingest_running' };
  // Written before its ingest is queued: the ingest reads the box when it starts.
  if (places.boxRedrawn && places.box !== null && !options.dryRun) {
    await setPlaceBounds(pool, slug, places.box);
  }
  if (step.kind === 'queue') {
    if (options.dryRun) return { status: 'ingest_queued' };
    // A refused key: the same ingest ran inside its window; waiting for it again would never end.
    for (const key of step.keys) {
      if ((await queueIngest(pool, slug, key)) !== null) return { status: 'ingest_queued' };
    }
  }
  if (step.redoKey === null) return { status: 'load', reingestQueued: false };
  if (options.dryRun) return { status: 'load', reingestQueued: true };
  const id = await queueIngest(pool, slug, step.redoKey);
  return { status: 'load', reingestQueued: id !== null };
}

/** The destination, its active places counted up to `thinBelow(lines)`, and its place box. */
export async function destinationOf(pool: pg.Pool, slug: string, lines: number) {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      name: string;
      country: string | null;
      active: string;
      min_lng: number | null;
      min_lat: number | null;
      max_lng: number | null;
      max_lat: number | null;
    }>(
      `SELECT d.id, d.name, d.country,
              (SELECT count(*) FROM (SELECT 1 FROM pois p
                 WHERE p.destination_id = d.id AND p.status = 'active' LIMIT $2) AS found)
                AS active,
              ST_XMin(b.g) AS min_lng, ST_YMin(b.g) AS min_lat,
              ST_XMax(b.g) AS max_lng, ST_YMax(b.g) AS max_lat
         FROM destinations d, LATERAL (SELECT d.place_bounds::geometry AS g) b
        WHERE d.slug = $1`,
      [slug, thinBelow(lines)],
    );
    const row = rows[0];
    if (row === undefined) return undefined;
    const { min_lng: minLng, min_lat: minLat, max_lng: maxLng, max_lat: maxLat } = row;
    const box: BoundingBox | null =
      minLng === null || minLat === null || maxLng === null || maxLat === null
        ? null
        : { minLng, minLat, maxLng, maxLat };
    return { id: row.id, name: row.name, country: row.country, active: Number(row.active), box };
  });
}
