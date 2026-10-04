/**
 * Machine picks for one destination without a curated set (docs/product-decisions.md D25): the
 * places drafting, suggestions and the phone's offline pack read where our editors have not
 * curated anything. The model names the destination's well-known places (it sees only the
 * destination's name); each name is kept only when one of our own rows carries it. The rest of
 * the list is the best open-data rows by the quality score search uses, shared across kinds of
 * place; transit, stays, health, chains and low-quality rows never fill. Ranks are written 1..N,
 * named places first, and a re-run replaces them. A destination with a curated set is left alone.
 */
import { nameWellKnownPlaces, type Gateway, type NamedPlace } from '@cp/ai';
import { LOW_QUALITY, MIN_CURATED_PLACES, pickCoverage, QUALITY_SCORE, withSystem } from '@cp/db';
import type pg from 'pg';

import type { JobLogger } from '../../boss/define-job';
import { matchNamedPlace, plainWords, searchWords, type PickCandidate } from './match';
import { PICK_BUCKETS, PICK_TARGET, rankPicks, type PickBucket, type RankedPick } from './select';

/** Rows read per named place, and per bucket for each seat it may fill (dedupe drops some). */
const NAME_CANDIDATES = 40;
const FILL_OVERSAMPLE = 3;

const NEVER = ['transit', 'stay', 'health'];

/** A food row whose name says coffee or tea: the open data has no cafe category. */
const CAFE_NAME = String.raw`(^|[^a-z])(cafe|coffee|caphe|ca phe|kafe|kopi|roastery|roasters|tea|tiem tra)([^a-z]|$)`;

const BUCKET_FILTER: Readonly<Record<PickBucket, string>> = {
  sights: `p.category IN ('temple_shrine', 'museum', 'nature', 'beach')`,
  food: `p.category = 'food' AND app.unaccent_immutable(lower(p.name)) !~ '${CAFE_NAME}'`,
  cafe: `p.category = 'food' AND app.unaccent_immutable(lower(p.name)) ~ '${CAFE_NAME}'`,
  market: `p.category = 'market'`,
  nightlife: `p.category = 'nightlife'`,
  shopping: `p.category = 'shopping'`,
};

const COLUMNS = `p.id, p.name, p.name_local, p.category, p.lat, p.lng, p.address,
  ${QUALITY_SCORE}::float8 AS quality`;

interface Row {
  readonly id: string;
  readonly name: string;
  readonly name_local: string | null;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly quality: number;
}

const candidateOf = (row: Row): PickCandidate => ({
  id: row.id,
  name: row.name,
  nameLocal: row.name_local,
  category: row.category,
  lat: row.lat,
  lng: row.lng,
  address: row.address,
  quality: row.quality,
});

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
    const words = searchWords(lead, plain);
    if (words.length === 0) continue;
    const { rows } = await tx.query<Row>(
      `SELECT ${COLUMNS}
         FROM pois p
        WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
          AND p.curation <> 'editorial' AND p.category <> ALL($4::text[])
          AND p.fts @@ to_tsquery('simple', $2)
        ORDER BY greatest(similarity(p.name, $5), similarity(p.name, $6),
                          similarity(coalesce(p.name_local, ''), $6)) DESC,
                 ts_rank(p.fts, to_tsquery('simple', $2)) DESC, p.id
        LIMIT $3`,
      // The words also match addresses (every shop on a street named after a sight), so rows
      // whose own name is closest to either name come first.
      [
        destinationId,
        words.join(' | '),
        NAME_CANDIDATES,
        NEVER,
        lead.name,
        lead.localName ?? lead.name,
      ],
    );
    const row = matchNamedPlace(
      lead,
      rows.map(candidateOf).filter((candidate) => !used.has(candidate.id)),
      plain,
    );
    if (row === null) continue;
    used.add(row.id);
    matched.push(row);
  }
  return matched;
}

/** Each bucket's best open-data rows: quality first, then the rows that say more about themselves. */
export async function loadFill(
  tx: pg.PoolClient,
  destinationId: string,
  perBucket: number,
): Promise<Record<PickBucket, PickCandidate[]>> {
  const fill = {} as Record<PickBucket, PickCandidate[]>;
  for (const bucket of PICK_BUCKETS) {
    const { rows } = await tx.query<Row>(
      `SELECT ${COLUMNS}
         FROM pois p
        WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
          AND p.curation <> 'editorial' AND NOT ${LOW_QUALITY} AND p.brand IS NULL
          AND ${BUCKET_FILTER[bucket]}
        ORDER BY ${QUALITY_SCORE} DESC,
                 (jsonb_path_exists(p.hours, '$.weekly.*[*]'))::int + (p.website IS NOT NULL)::int
                   + (p.phone IS NOT NULL)::int DESC,
                 p.id
        LIMIT $2`,
      [destinationId, perBucket],
    );
    fill[bucket] = rows.map(candidateOf);
  }
  return fill;
}

/** Replaces the destination's ranks with `picks`; one writer at a time per destination. */
export async function writePicks(
  tx: pg.PoolClient,
  destinationId: string,
  picks: readonly RankedPick[],
): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtextextended('places.pick:' || $1, 0))`, [
    destinationId,
  ]);
  const ids = picks.map((pick) => pick.id);
  await tx.query(
    `UPDATE pois SET pick_rank = NULL, pick_source = NULL
      WHERE destination_id = $1 AND pick_rank IS NOT NULL AND id <> ALL($2::uuid[])`,
    [destinationId, ids],
  );
  await tx.query(
    `UPDATE pois p SET pick_rank = v.rank, pick_source = v.source
       FROM unnest($1::uuid[], $2::int[], $3::text[]) AS v(id, rank, source)
      WHERE p.id = v.id
        AND (p.pick_rank IS DISTINCT FROM v.rank OR p.pick_source IS DISTINCT FROM v.source)`,
    [ids, picks.map((pick) => pick.rank), picks.map((pick) => pick.source)],
  );
}

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
  if (coverage.curated >= MIN_CURATED_PLACES) return skipped(slug, 'curated');
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
