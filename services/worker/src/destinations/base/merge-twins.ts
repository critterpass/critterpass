/**
 * Folds base rows that duplicate a critter destination (`isTwin`: same country, a shared name or
 * alias, centres within 40 km) into the critter row. The critter row keeps its slug, name and
 * critter and gains the base row's missing facts (country code, centre, population, ids, names,
 * texts); every row that points at the base row (each foreign key to `destinations`, destination
 * poll options and photo subjects) moves to the critter row; then the base row is deleted. When a
 * critter row has no centre, its best-ranked twin stands in and further twins must lie within
 * 40 km of it. Each pair runs in its own transaction; a dry run rolls every pair back.
 */
import {
  destinationSubject,
  haversineKm,
  isTwin,
  placeNames,
  TWIN_RADIUS_KM,
  type TwinPlace,
} from '@cp/domain';
import type pg from 'pg';

interface Row {
  id: string;
  slug: string;
  name: string;
  names: Record<string, string> | null;
  country: string | null;
  country_code: string | null;
  lat: number | null;
  lng: number | null;
  origin: 'critter' | 'base';
  base_rank: number | null;
}

export interface TwinPair {
  readonly critter: { readonly id: string; readonly slug: string };
  readonly base: { readonly id: string; readonly slug: string; readonly name: string };
}

const asPlace = (row: Row): TwinPlace => ({
  slug: row.slug,
  names: placeNames(row.name, row.names),
  countryCode: row.country_code,
  country: row.country,
  lat: row.lat,
  lng: row.lng,
});

export async function findBaseTwins(tx: pg.PoolClient): Promise<TwinPair[]> {
  const { rows } = await tx.query<Row>(
    `SELECT id, slug, name, names, country, country_code, lat, lng, origin, base_rank
       FROM destinations WHERE origin IN ('critter', 'base')
      ORDER BY base_rank DESC NULLS LAST, slug`,
  );
  const critters = rows.filter((row) => row.origin === 'critter');
  const groups = new Map<Row, Row[]>();
  for (const base of rows) {
    if (base.origin !== 'base') continue;
    const critter = critters.find((row) => isTwin(asPlace(row), asPlace(base)));
    if (critter !== undefined) groups.set(critter, [...(groups.get(critter) ?? []), base]);
  }
  const pairs: TwinPair[] = [];
  for (const [critter, twins] of groups) {
    const [first] = twins;
    const anchor =
      critter.lat === null && first?.lat != null && first.lng != null
        ? { lat: first.lat, lng: first.lng }
        : null;
    const kept =
      anchor === null
        ? twins
        : twins.filter(
            (row) =>
              row.lat !== null &&
              row.lng !== null &&
              haversineKm(anchor.lat, anchor.lng, row.lat, row.lng) <= TWIN_RADIUS_KM,
          );
    for (const base of kept) {
      pairs.push({
        critter: { id: critter.id, slug: critter.slug },
        base: { id: base.id, slug: base.slug, name: base.name },
      });
    }
  }
  return pairs.sort((a, b) => a.critter.slug.localeCompare(b.critter.slug));
}

interface ForeignKey {
  tbl: string;
  col: string;
  cascades: boolean;
}

async function foreignKeys(tx: pg.PoolClient): Promise<ForeignKey[]> {
  const { rows } = await tx.query<ForeignKey>(
    `SELECT c.conrelid::regclass::text AS tbl, quote_ident(a.attname) AS col,
            c.confdeltype = 'c' AS cascades
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'destinations'::regclass
        AND array_length(c.conkey, 1) = 1
      ORDER BY 1, 2`,
  );
  return rows;
}

/** Moves one base row's references onto its critter twin, fills the critter row, deletes it. */
export async function mergeBaseTwin(
  tx: pg.PoolClient,
  pair: TwinPair,
): Promise<Record<string, number>> {
  const moved: Record<string, number> = {};
  const { rows: ids } = await tx.query<{ qid: string | null; geonames_id: number | null }>(
    `SELECT wikidata_qid AS qid, geonames_id FROM destinations
      WHERE id = $1 AND origin = 'base' FOR UPDATE`,
    [pair.base.id],
  );
  const held = ids[0];
  if (held === undefined) throw new Error(`base row ${pair.base.slug} is gone`);
  // The ids are unique: free them on the base row before the critter row takes them.
  await tx.query(`UPDATE destinations SET wikidata_qid = NULL, geonames_id = NULL WHERE id = $1`, [
    pair.base.id,
  ]);
  await tx.query(
    `UPDATE destinations c SET
       country_code = coalesce(c.country_code, b.country_code),
       country = coalesce(c.country, b.country),
       lat = CASE WHEN c.lat IS NULL OR c.lng IS NULL THEN b.lat ELSE c.lat END,
       lng = CASE WHEN c.lat IS NULL OR c.lng IS NULL THEN b.lng ELSE c.lng END,
       kind = coalesce(c.kind, b.kind),
       admin1 = coalesce(c.admin1, b.admin1),
       population = coalesce(c.population, b.population),
       currency = coalesce(c.currency, b.currency),
       tz = coalesce(c.tz, b.tz),
       best_months = coalesce(c.best_months, b.best_months),
       wikidata_qid = coalesce(c.wikidata_qid, $3),
       geonames_id = coalesce(c.geonames_id, $4),
       names = coalesce(b.names, '{}'::jsonb) || coalesce(c.names, '{}'::jsonb),
       texts = coalesce(b.texts, '{}'::jsonb) || coalesce(c.texts, '{}'::jsonb),
       base_rank = coalesce(c.base_rank, b.base_rank),
       base_built_at = coalesce(c.base_built_at, b.base_built_at)
     FROM destinations b WHERE c.id = $1 AND b.id = $2`,
    [pair.critter.id, pair.base.id, held.qid, held.geonames_id],
  );
  for (const fk of await foreignKeys(tx)) {
    await tx.query('SAVEPOINT move_ref');
    try {
      const { rowCount } = await tx.query(
        `UPDATE ${fk.tbl} SET ${fk.col} = $1 WHERE ${fk.col} = $2`,
        [pair.critter.id, pair.base.id],
      );
      if ((rowCount ?? 0) > 0) moved[fk.tbl] = (moved[fk.tbl] ?? 0) + (rowCount ?? 0);
      await tx.query('RELEASE SAVEPOINT move_ref');
    } catch (error) {
      await tx.query('ROLLBACK TO SAVEPOINT move_ref');
      const code = (error as { code?: string }).code;
      // A row the critter already has its own copy of goes with the base row (cascade).
      if (!fk.cascades || (code !== '23505' && code !== '23514')) throw error;
      moved[`${fk.tbl} (dropped)`] = 1;
    }
  }
  const { rowCount: options } = await tx.query(
    `UPDATE poll_options SET ref_id = $1 WHERE kind = 'destination' AND ref_id = $2`,
    [pair.critter.id, pair.base.id],
  );
  if ((options ?? 0) > 0) moved['poll_options'] = options ?? 0;
  const from = destinationSubject(pair.base.slug);
  const to = destinationSubject(pair.critter.slug);
  const { rowCount: photos } = await tx.query(
    `UPDATE media_assets SET subject_keys = CASE
         WHEN EXISTS (SELECT 1 FROM media_assets m WHERE $2 = ANY (m.subject_keys))
           THEN array_remove(subject_keys, $1)
         ELSE array_replace(subject_keys, $1, $2) END
      WHERE $1 = ANY (subject_keys)`,
    [from, to],
  );
  if ((photos ?? 0) > 0) moved['media_assets'] = photos ?? 0;
  await tx.query(`DELETE FROM destinations WHERE id = $1`, [pair.base.id]);
  return moved;
}

export interface MergeResult {
  readonly dryRun: boolean;
  readonly pairs: readonly (TwinPair & { readonly moved: Record<string, number> })[];
}

async function inTransaction<T>(
  pool: pg.Pool,
  commit: boolean,
  fn: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Runs as the connecting role (a maintenance task that moves rows across user tables), not as
 * `app_system`. A dry run performs every merge and rolls it back, so it proves the moves too.
 */
export async function mergeBaseTwins(
  pool: pg.Pool,
  options: { readonly dryRun?: boolean } = {},
): Promise<MergeResult> {
  const dryRun = options.dryRun === true;
  const pairs = await inTransaction(pool, false, findBaseTwins);
  const merged: (TwinPair & { moved: Record<string, number> })[] = [];
  for (const pair of pairs) {
    const moved = await inTransaction(pool, !dryRun, (tx) => mergeBaseTwin(tx, pair));
    merged.push({ ...pair, moved });
  }
  return { dryRun, pairs: merged };
}
