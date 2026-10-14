/**
 * Machine picks for one destination without a curated set (docs/product-decisions.md D25): the
 * places drafting, suggestions and the phone's offline pack read where our editors have not
 * curated anything. The model names the destination's well-known places (it sees only the
 * destination's name); each name is kept only when one of our own rows carries it. The rest of
 * the list is the best open-data rows by the quality score search uses, shared across kinds of
 * place; transit, stays, health, chains and low-quality rows never fill. Ranks are written 1..N,
 * named places first, and a re-run replaces them. A destination with a curated set has no picks:
 * ranks made before the set arrived are cleared, so its recommended places are the editors' alone.
 */
import { nameWellKnownPlaces, type Gateway, type NamedPlace } from '@cp/ai';
import { MIN_CURATED_PLACES, pickCoverage, withSystem } from '@cp/db';
import type pg from 'pg';

import type { JobLogger } from '../../boss/define-job';
import { namedCandidates } from './candidates';
import { matchNamedPlace, plainWords, type PickCandidate } from './match';
import {
  FILL_OVERSAMPLE,
  loadFill,
  PICK_TARGET,
  rankPicks,
  writePicks,
} from '../profile/brief-picks';

/** Removes every rank of the destination; returns how many rows held one. */
export async function clearPicks(tx: pg.PoolClient, destinationId: string): Promise<number> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('places.pick:' || $1, 0))`, [
    destinationId,
  ]);
  const cleared = await tx.query(
    `UPDATE pois SET pick_rank = NULL, pick_source = NULL
      WHERE destination_id = $1 AND pick_rank IS NOT NULL`,
    [destinationId],
  );
  return cleared.rowCount ?? 0;
}

export interface PlacePickDeps {
  /** Absent without a model key: the picks are then the open-data fill alone. */
  readonly gateway?: { readonly callModel: Gateway['callModel'] } | undefined;
}

export interface PlacePickOptions {
  /** The destination, by id or by slug. */
  readonly destinationId?: string;
  readonly slug?: string;
  /** Pick again even when the destination already has picks. */
  readonly force?: boolean;
  /** Let a failed model call throw (the job's earlier attempts) instead of filling without names. */
  readonly requireNames?: boolean;
  readonly signal?: AbortSignal;
}

export interface PlacePickReport {
  readonly destination: string | null;
  readonly status: 'picked' | 'skipped';
  readonly reason?: 'unknown_destination' | 'curated' | 'already_picked';
  /** Places the model named, and how many of them our rows carry. */
  readonly named: number;
  readonly matched: number;
  readonly filled: number;
  readonly total: number;
  readonly names: 'ok' | 'unavailable' | 'failed';
  /** Ranks removed from a destination that has gained a curated set. */
  readonly cleared?: number;
}

const skipped = (
  destination: string | null,
  reason: NonNullable<PlacePickReport['reason']>,
): PlacePickReport => ({
  destination,
  status: 'skipped',
  reason,
  named: 0,
  matched: 0,
  filled: 0,
  total: 0,
  names: 'unavailable',
});

/** The rows each named place may be, matched one name at a time; a row is used once. */
export async function matchNamedPlaces(
  tx: pg.PoolClient,
  destinationId: string,
  leads: readonly NamedPlace[],
  plain: ReadonlySet<string>,
): Promise<PickCandidate[]> {
  const matched: PickCandidate[] = [];
  const used = new Set<string>();
  for (const lead of leads) {
    const candidates = await namedCandidates(tx, destinationId, lead, plain);
    const row = matchNamedPlace(
      lead,
      candidates.filter((candidate) => !used.has(candidate.id)),
      plain,
    );
    if (row === null) continue;
    used.add(row.id);
    matched.push(row);
  }
  return matched;
}

export { FILL_SCAN, loadFill, writePicks } from '../profile/brief-picks';

export async function runPlacePick(
  pool: pg.Pool,
  deps: PlacePickDeps,
  options: PlacePickOptions,
  logger: JobLogger,
): Promise<PlacePickReport> {
  const destination = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      slug: string;
      name: string;
      country: string | null;
    }>(
      `SELECT id, slug, name, country FROM destinations
        WHERE ($1::uuid IS NOT NULL AND id = $1) OR ($2::text IS NOT NULL AND slug = $2)`,
      [options.destinationId ?? null, options.slug ?? null],
    );
    const row = rows[0];
    return row === undefined ? null : { ...row, coverage: await pickCoverage(tx, row.id) };
  });
  if (destination === null) return skipped(options.slug ?? null, 'unknown_destination');
  const { slug, coverage } = destination;
  if (coverage.curated >= MIN_CURATED_PLACES) {
    const cleared = coverage.picked
      ? await withSystem(pool, (tx) => clearPicks(tx, destination.id))
      : 0;
    if (cleared > 0) logger.info({ slug, cleared }, 'place picks cleared: curated set in place');
    return { ...skipped(slug, 'curated'), cleared };
  }
  if (coverage.picked && options.force !== true) return skipped(slug, 'already_picked');

  let leads: NamedPlace[] = [];
  let names: PlacePickReport['names'] = 'unavailable';
  if (deps.gateway !== undefined) {
    try {
      leads = await nameWellKnownPlaces(
        deps.gateway,
        { destination: destination.name, country: destination.country },
        options.signal === undefined ? {} : { signal: options.signal },
      );
      names = 'ok';
    } catch (error) {
      if (options.requireNames === true) throw error;
      names = 'failed';
      logger.warn({ err: error, slug }, 'place pick: naming failed, filling from open data alone');
    }
  }

  const plain = plainWords(destination.name, destination.country);
  const report = await withSystem(pool, async (tx) => {
    const matched = await matchNamedPlaces(tx, destination.id, leads, plain);
    const fill = await loadFill(tx, destination.id, PICK_TARGET * FILL_OVERSAMPLE);
    const picks = rankPicks(matched, fill);
    await writePicks(tx, destination.id, picks);
    const kept = picks.filter((pick) => pick.source === 'named').length;
    return { matched: kept, filled: picks.length - kept, total: picks.length };
  });
  const result: PlacePickReport = {
    destination: slug,
    status: 'picked',
    named: leads.length,
    names,
    ...report,
  };
  logger.info({ ...result }, 'places picked');
  return result;
}
