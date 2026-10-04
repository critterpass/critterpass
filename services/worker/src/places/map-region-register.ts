/**
 * Registers region packs that have appeared on the tiles bucket (`places.map_region_register`).
 *
 * A pack is published by putting `<slug>/tiles-v<n>.pmtiles` on the public `cp-tiles` bucket
 * (the `map regions` workflow, or tools/maps/upload-r2.ts); the bucket is the source of truth and
 * nothing that uploads needs a database credential. For every destination this asks the public
 * address of its next version (v1 when it has no row, one past its highest otherwise) with a HEAD
 * request, and inserts the `map_regions` row, with the size from Content-Length, when the file is
 * there. Existing rows are never touched, and a row is inserted once: the unique
 * `(destination_id, version)` key drops a second insert from an overlapping run.
 *
 * The probing is bounded: a few requests at a time, each with a timeout, none retried (the next
 * run asks again), and the run stops asking as soon as the host says 429.
 */
import { withSystem } from '@cp/db';
import type pg from 'pg';

const PROBE_CONCURRENCY = 4;
const PROBE_TIMEOUT_MS = 5_000;

export interface MapRegionCandidate {
  readonly destinationId: string;
  readonly slug: string;
  /** The version to look for, as a number (`3` for `tiles-v3.pmtiles`). */
  readonly nextVersion: number;
}

export interface MapRegionRegisterReport {
  readonly probed: number;
  readonly registered: number;
  /** Probes that got no clear answer (a timeout, a network error, a status other than 200/404). */
  readonly unanswered: number;
  /** The host answered 429: the rest of this run's destinations were left for the next run. */
  readonly rateLimited: boolean;
}

export interface MapRegionRegisterOptions {
  readonly tilesBaseUrl: string;
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
}

export function packKey(slug: string, version: number): string {
  return `${slug}/tiles-v${String(version)}.pmtiles`;
}

async function listCandidates(pool: pg.Pool): Promise<MapRegionCandidate[]> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; slug: string; next_version: number }>(
      `SELECT d.id::text AS id, d.slug,
              COALESCE(max(substring(m.version FROM '^v([0-9]+)$')::int), 0) + 1 AS next_version
         FROM destinations d
         LEFT JOIN map_regions m ON m.destination_id = d.id
        GROUP BY d.id, d.slug
        ORDER BY d.slug`,
    );
    return rows.map((row) => ({
      destinationId: row.id,
      slug: row.slug,
      nextVersion: row.next_version,
    }));
  });
}

type Probe =
  | { readonly kind: 'found'; readonly bytes: number }
  | { readonly kind: 'absent' | 'unanswered' | 'rate_limited' };

async function probePack(url: string, options: MapRegionRegisterOptions): Promise<Probe> {
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await (options.fetcher ?? fetch)(url, { method: 'HEAD', signal });
    if (response.status === 404) return { kind: 'absent' };
    if (response.status === 429) return { kind: 'rate_limited' };
    if (response.status !== 200) return { kind: 'unanswered' };
    const bytes = Number(response.headers.get('content-length'));
    // A pack with no stated size cannot be shown in the storage UI: wait for a clear answer.
    return Number.isSafeInteger(bytes) && bytes > 0
      ? { kind: 'found', bytes }
      : { kind: 'unanswered' };
  } catch {
    return { kind: 'unanswered' };
  }
}

async function insertOnce(
  pool: pg.Pool,
  candidate: MapRegionCandidate,
  bytes: number,
): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const { rowCount } = await tx.query(
      `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (destination_id, version) DO NOTHING`,
      [
        candidate.destinationId,
        packKey(candidate.slug, candidate.nextVersion),
        bytes,
        `v${String(candidate.nextVersion)}`,
      ],
    );
    return rowCount === 1;
  });
}

export async function registerMapRegions(
  pool: pg.Pool,
  options: MapRegionRegisterOptions,
): Promise<MapRegionRegisterReport> {
  const base = options.tilesBaseUrl.replace(/\/+$/u, '');
  const queue = await listCandidates(pool);
  const counts = { probed: 0, registered: 0, unanswered: 0 };
  let rateLimited = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (rateLimited || options.signal?.aborted === true) return;
      const candidate = queue.shift();
      if (candidate === undefined) return;
      counts.probed += 1;
      const url = `${base}/${packKey(candidate.slug, candidate.nextVersion)}`;
      const probe = await probePack(url, options);
      if (probe.kind === 'rate_limited') rateLimited = true;
      else if (probe.kind === 'unanswered') counts.unanswered += 1;
      else if (probe.kind === 'found' && (await insertOnce(pool, candidate, probe.bytes))) {
        counts.registered += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: PROBE_CONCURRENCY }, worker));
  return { ...counts, rateLimited };
}
