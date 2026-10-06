/**
 * `place_profiles` reads and writes for the profile jobs, all as app_system. A run writes its row in
 * steps: pending when it starts, ready with the text as soon as the write is checked, then the
 * second-source facts, then the photos, so a reader gets the text without waiting for the rest.
 */
import type { KeptFact, DroppedFact, SecondSourceAnswer } from '@cp/ai';
import { withSystem } from '@cp/db';
import type { PlaceProfileText } from '@cp/domain';
import type pg from 'pg';

import type { StoredPhoto } from './photos';

export interface ProfileTarget {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly tags: readonly string[];
  readonly sources: readonly string[];
  readonly website: string | null;
  readonly address: string | null;
  readonly town: string;
  readonly country: string | null;
  /** A reviewed note exists (`pois.editorial.why_go`): it always wins, no profile is written. */
  readonly reviewed: boolean;
  readonly status: string | null;
}

export async function loadProfileTarget(
  pool: pg.Pool,
  poiId: string,
): Promise<ProfileTarget | null> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      name: string;
      name_local: string | null;
      category: string;
      tags: string[] | null;
      sources: string[] | null;
      website: string | null;
      address: string | null;
      town: string;
      country: string | null;
      reviewed: boolean;
      status: string | null;
    }>(
      `SELECT p.id, p.name, p.name_local, p.category, p.tags,
              ARRAY(SELECT jsonb_object_keys(coalesce(p.source_ids, '{}'::jsonb))) AS sources,
              p.website, p.address, d.name AS town, d.country,
              coalesce(p.editorial ? 'why_go', false) AS reviewed,
              -- Typed fields from a reviewed note are no profile of the job's own.
              CASE WHEN pp.basis = 'web' THEN pp.status END AS status
         FROM pois p
         JOIN destinations d ON d.id = p.destination_id
         LEFT JOIN place_profiles pp ON pp.poi_id = p.id
        WHERE p.id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL`,
      [poiId],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      name: row.name,
      nameLocal: row.name_local,
      category: row.category,
      tags: row.tags ?? [],
      sources: row.sources ?? [],
      website: row.website,
      address: row.address,
      town: row.town,
      country: row.country,
      reviewed: row.reviewed,
      status: row.status,
    };
  });
}

/** Spend on profiles in runs started since midnight UTC (micros); typing reviewed notes aside. */
export async function spentTodayMicros(pool: pg.Pool, now: Date): Promise<number> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ micros: string }>(
      `SELECT coalesce(sum(cost_micros), 0)::text AS micros FROM place_profiles
        WHERE basis = 'web' AND requested_at >= date_trunc('day', $1::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [now],
    );
    return Number(rows[0]?.micros ?? 0);
  });
}

/** The error a run skipped at the spent daily cap leaves; readers queue nothing until midnight UTC. */
export const DAILY_CAP_ERROR = 'daily_cap';

/**
 * Marks a place whose run stopped at the spent daily cap (`failed`, `daily_cap`, stamped now), so
 * its readers queue no new run until the cap resets. A ready or declined profile is left as it is.
 */
export async function markCapped(pool: pg.Pool, poiId: string, now: Date): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO place_profiles (poi_id, status, error, requested_at, updated_at)
       VALUES ($1, 'failed', $3, $2, $2)
       ON CONFLICT (poi_id) DO UPDATE SET status = 'failed', error = $3, updated_at = $2
         WHERE place_profiles.status NOT IN ('ready', 'declined')`,
      [poiId, now, DAILY_CAP_ERROR],
    ),
  );
}

/** Starts a run: a new row is pending; a ready profile stays readable while it is rewritten. */
export async function markRunStarted(pool: pg.Pool, poiId: string, now: Date): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO place_profiles (poi_id, status, requested_at, updated_at)
       VALUES ($1, 'pending', $2, $2)
       ON CONFLICT (poi_id) DO UPDATE
         SET status = CASE WHEN place_profiles.status = 'ready' THEN 'ready' ELSE 'pending' END,
             requested_at = $2, error = NULL, updated_at = $2`,
      [poiId, now],
    ),
  );
}

export interface TextWrite {
  readonly texts: Readonly<Record<string, PlaceProfileText>>;
  readonly category: string | null;
  readonly mealRole: string | null;
  readonly bestTimes: readonly string[];
  readonly visitMin: number;
  readonly dish: string | null;
  readonly facts: readonly KeptFact[];
  readonly dropped: readonly DroppedFact[];
  readonly sources: readonly { readonly url: string; readonly title: string }[];
  readonly model: string;
  readonly costMicros: number;
  readonly timings: Readonly<Record<string, number>>;
}

/** The checked text: the profile is ready from here on. Translations made earlier are dropped. */
export async function saveProfileText(pool: pg.Pool, poiId: string, w: TextWrite): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE place_profiles
          SET status = 'ready', basis = 'web', texts = $2, category = $3, meal_role = $4, best_times = $5,
              visit_min = $6, dish = $7, facts = $8, dropped_facts = $9, sources = $10,
              second_source = NULL, model = $11, cost_micros = cost_micros + $12,
              timings = timings || $13, generated_at = now(), updated_at = now()
        WHERE poi_id = $1`,
      [
        poiId,
        JSON.stringify(w.texts),
        w.category,
        w.mealRole,
        [...w.bestTimes],
        w.visitMin,
        w.dish,
        JSON.stringify(w.facts),
        JSON.stringify(w.dropped),
        JSON.stringify(w.sources),
        w.model,
        w.costMicros,
        JSON.stringify(w.timings),
      ],
    ),
  );
}

export interface FactsWrite {
  readonly texts: Readonly<Record<string, PlaceProfileText>>;
  readonly facts: readonly KeptFact[];
  readonly dropped: readonly DroppedFact[];
  readonly second: {
    readonly answer: SecondSourceAnswer | null;
    readonly urls: readonly string[];
  } | null;
  readonly costMicros: number;
  readonly timings: Readonly<Record<string, number>>;
}

/** Facts after the second source: the written languages' lines are replaced with them. */
export async function saveProfileFacts(pool: pg.Pool, poiId: string, w: FactsWrite): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE place_profiles
          SET texts = $2, facts = $3, dropped_facts = $4, second_source = $5,
              cost_micros = cost_micros + $6, timings = timings || $7, updated_at = now()
        WHERE poi_id = $1`,
      [
        poiId,
        JSON.stringify(w.texts),
        JSON.stringify(w.facts),
        JSON.stringify(w.dropped),
        w.second === null ? null : JSON.stringify(w.second),
        w.costMicros,
        JSON.stringify(w.timings),
      ],
    ),
  );
}

export async function saveProfilePhotos(
  pool: pg.Pool,
  poiId: string,
  photos: readonly StoredPhoto[],
  timings: Readonly<Record<string, number>>,
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE place_profiles SET photos = $2, timings = timings || $3, updated_at = now()
        WHERE poi_id = $1`,
      [poiId, JSON.stringify(photos), JSON.stringify(timings)],
    ),
  );
}

/** A run that ends without a profile: the pages were not about the place, or every try failed. */
export async function markRunEnded(
  pool: pg.Pool,
  poiId: string,
  end: {
    readonly status: 'declined' | 'failed';
    readonly error: string | null;
    readonly model: string | null;
    readonly costMicros: number;
  },
): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE place_profiles
          SET status = CASE WHEN status = 'ready' THEN 'ready' ELSE $2 END, error = $3,
              model = coalesce($4, model), cost_micros = cost_micros + $5,
              generated_at = coalesce(generated_at, now()), updated_at = now()
        WHERE poi_id = $1`,
      [poiId, end.status, end.error, end.model, end.costMicros],
    ),
  );
}

/** Adds one language's lines to a ready profile that does not have it yet. */
export async function saveProfileTranslation(
  pool: pg.Pool,
  poiId: string,
  locale: string,
  text: PlaceProfileText,
  costMicros: number,
): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const result = await tx.query(
      `UPDATE place_profiles
          SET texts = texts || jsonb_build_object($2::text, $3::jsonb),
              cost_micros = cost_micros + $4, updated_at = now()
        WHERE poi_id = $1 AND status = 'ready' AND texts ? 'en' AND NOT texts ? $2`,
      [poiId, locale, JSON.stringify(text), costMicros],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
