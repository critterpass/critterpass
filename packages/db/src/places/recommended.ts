/**
 * Which places we suggest, as SQL every reader shares (docs/data-model.md §3.13 `pois`).
 *
 * A place is "recommended" when our editors curated it (`curation = 'editorial'`) or the
 * `places.pick` job picked it for a destination without a curated set (`pick_rank`). Drafting,
 * suggestions, the fixers and the phone's offline pack all read that one set, in one order: the
 * editors' must-sees, then the rest of the curated set, then the picks by rank.
 *
 * The open-data quality score lives here too: search ranks with it and the pick job fills with it.
 * Fragments take the table alias (`p` by default); a `null` alias means bare column names (views
 * and single-table queries).
 */
import type pg from 'pg';

const column = (alias: string | null, name: string) => (alias === null ? name : `${alias}.${name}`);

/** Overture confidence under which an auto row FSQ does not also list counts as low quality. */
export const LOW_CONFIDENCE = 0.5;

/** True for an auto-curated, Overture-only row whose confidence is under `LOW_CONFIDENCE`. */
export function lowQualitySql(alias: string | null = 'p'): string {
  const c = (name: string) => column(alias, name);
  return `(${c('curation')} <> 'editorial' AND NOT (${c('source_ids')} ? 'fsq_os') AND coalesce(${c('confidence')} < ${LOW_CONFIDENCE}, false))`;
}

/**
 * Non-editorial quality in about [0, 4]: listed by FSQ OS, by both sources, a mapped category, and
 * Overture's confidence (an unknown score counts as middling).
 */
export function qualityScoreSql(alias: string | null = 'p'): string {
  const c = (name: string) => column(alias, name);
  return `((${c('source_ids')} ? 'fsq_os')::int + (${c('source_ids')} ? 'fsq_os' AND ${c('source_ids')} ? 'overture')::int + (${c('category')} <> 'other')::int + coalesce(${c('confidence')}, 0.5))`;
}

/**
 * The `p`-aliased forms. They are repeated verbatim in the `pois_destination_browse_idx`
 * migration: the planner uses that index for a no-query browse only while the texts match.
 */
export const LOW_QUALITY = lowQualitySql('p');
export const QUALITY_SCORE = qualityScoreSql('p');

/** Editorial, or picked for a destination without a curated set. */
export function recommendedSql(alias: string | null = 'p'): string {
  const c = (name: string) => column(alias, name);
  return `(${c('curation')} = 'editorial' OR ${c('pick_rank')} IS NOT NULL)`;
}

/** `ORDER BY` terms: the editors' must-sees, then the curated set, then the picks by rank. */
export function recommendedOrderSql(alias: string | null = 'p'): string {
  const c = (name: string) => column(alias, name);
  return `(${c('curation')} = 'editorial' AND (${c('editorial')}->>'must_see')::boolean IS TRUE) DESC, (${c('curation')} = 'editorial') DESC, ${c('pick_rank')} ASC NULLS LAST`;
}

/**
 * The same set and order over `llm.pois`, whose `must_see` is already a column (a must-see flag
 * on an open-data row, set by an editor's overlay, counts there too).
 */
export const LLM_RECOMMENDED = "(curation = 'editorial' OR must_see OR pick_rank IS NOT NULL)";
export const LLM_RECOMMENDED_ORDER =
  "(curation = 'editorial' AND must_see) DESC, (curation = 'editorial') DESC, pick_rank ASC NULLS LAST";

/** A destination with fewer active editorial places than this gets machine picks. */
export const MIN_CURATED_PLACES = 50;

export interface PickCoverage {
  /** Active editorial places, counted up to `MIN_CURATED_PLACES`. */
  readonly curated: number;
  readonly picked: boolean;
  /** True when the destination has no curated set to speak of and no picks yet. */
  readonly needsPicks: boolean;
}

/** Whether a destination still needs its machine picks; runs in the caller's transaction. */
export async function pickCoverage(
  tx: pg.PoolClient,
  destinationId: string,
): Promise<PickCoverage> {
  const { rows } = await tx.query<{ curated: number; picked: boolean }>(
    `SELECT (SELECT count(*)::int FROM (
               SELECT 1 FROM pois p
                WHERE p.destination_id = $1 AND p.status = 'active' AND p.curation = 'editorial'
                  AND p.merged_into_id IS NULL
                LIMIT $2) AS found) AS curated,
            EXISTS (SELECT 1 FROM pois p
                     WHERE p.destination_id = $1 AND p.pick_rank IS NOT NULL) AS picked`,
    [destinationId, MIN_CURATED_PLACES],
  );
  const curated = rows[0]?.curated ?? 0;
  const picked = rows[0]?.picked ?? false;
  return { curated, picked, needsPicks: curated < MIN_CURATED_PLACES && !picked };
}
