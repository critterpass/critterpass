/**
 * Typed fields for curated places: the places with a reviewed editors' note (`pois.editorial`),
 * which the profile job never writes. Each gets Jev's labels (decision route `place.labels`, the
 * profile job's questions) read from its row and its note, the editors' visit length, and, for a
 * place to eat or drink, the dish it is known for, read by the profile write (fast tier) from the
 * note as its only page. The row is saved as `basis = 'reviewed_note'`: typed fields only, no
 * texts, facts or photos, so the note keeps the prose and a reader never sees a profile for it.
 * A profile the job wrote from the web is never touched.
 */
import {
  BEST_TIME_YES,
  buildPlaceProfileRequest,
  checkPlaceProfileReply,
  isDeclined,
  parseStructuredText,
  PLACE_LABELS_ROUTE,
  PLACE_PROFILE_ROUTES,
  placeLabelQuestions,
  textOf,
  type DecisionClient,
  type Gateway,
  type ProfilePage,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  decisionBand,
  PLACE_BEST_TIMES,
  PROFILE_SKIPPED_CATEGORIES,
  type PlaceBestTime,
  type PlaceMealRole,
  type PoiCategory,
} from '@cp/domain';
import type pg from 'pg';

import { profilePlace } from './evidence';
import type { ProfileTarget } from './store';

export interface CuratedTarget extends ProfileTarget {
  readonly whyGo: string;
  readonly bestTime: string | null;
  readonly crowdHint: string | null;
  readonly tips: readonly string[];
  readonly timeNeededMin: number | null;
}

export interface CuratedTyping {
  readonly category: PoiCategory | null;
  readonly mealRole: PlaceMealRole | null;
  readonly bestTimes: readonly PlaceBestTime[];
  readonly visitMin: number | null;
  readonly dish: string | null;
  readonly model: string;
  readonly costMicros: number;
}

export interface CuratedTypingDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly decisions: Pick<DecisionClient, 'decide'>;
}

/** The page the dish is read from: the note itself, which the model may only quote. */
export const NOTE_URL = 'https://critterpass.app/reviewed-note';

/**
 * Curated places still to type: no profile, a run that never got one, or (with `force`) typed
 * from their note before. Kinds that get no profile are left to their kind's facts.
 */
export async function loadCuratedTargets(
  pool: pg.Pool,
  options: { readonly force: boolean; readonly destination?: string | undefined },
): Promise<CuratedTarget[]> {
  const destinations = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM destinations WHERE $1::text IS NULL OR slug = $1 ORDER BY slug`,
      [options.destination ?? null],
    );
    return rows.map((row) => row.id);
  });
  const found: CuratedTarget[] = [];
  // One destination per statement: each reads its own places by the destination index.
  for (const id of destinations) found.push(...(await curatedOf(pool, id, options.force)));
  return found;
}

async function curatedOf(
  pool: pg.Pool,
  destinationId: string,
  force: boolean,
): Promise<CuratedTarget[]> {
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
      status: string | null;
      why_go: string;
      best_time: string | null;
      crowd_hint: string | null;
      tips: unknown;
      time_needed_min: string | null;
    }>(
      `SELECT p.id, p.name, p.name_local, p.category, p.tags,
              ARRAY(SELECT jsonb_object_keys(coalesce(p.source_ids, '{}'::jsonb))) AS sources,
              p.website, p.address, d.name AS town, d.country, pp.status,
              p.editorial->>'why_go' AS why_go, p.editorial->>'best_time' AS best_time,
              p.editorial->>'crowd_hint' AS crowd_hint, p.editorial->'tips' AS tips,
              CASE WHEN jsonb_typeof(p.editorial->'time_needed_min') = 'number'
                   THEN p.editorial->>'time_needed_min' END AS time_needed_min
         FROM pois p
         JOIN destinations d ON d.id = p.destination_id
         LEFT JOIN place_profiles pp ON pp.poi_id = p.id
        WHERE p.destination_id = $3 AND p.status = 'active' AND p.merged_into_id IS NULL
          AND coalesce(p.editorial->>'why_go', '') <> ''
          AND p.category <> ALL($1::text[])
          AND (pp.poi_id IS NULL OR pp.status <> 'ready' OR (pp.basis = 'reviewed_note' AND $2))
        ORDER BY p.id`,
      [[...PROFILE_SKIPPED_CATEGORIES], force, destinationId],
    );
    return rows.map((row) => ({
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
      reviewed: true,
      status: row.status,
      whyGo: row.why_go,
      bestTime: row.best_time,
      crowdHint: row.crowd_hint,
      tips: Array.isArray(row.tips) ? row.tips.filter((t) => typeof t === 'string') : [],
      timeNeededMin: row.time_needed_min === null ? null : Number(row.time_needed_min),
    }));
  });
}

/** The editors' visit length, held to what a profile row stores (15 to 600 minutes). */
export function editorsVisitMin(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(600, Math.max(15, Math.round(minutes)));
}

/** A place to eat or drink by its kind or its label: the dish is worth reading. */
export function wantsDish(category: string, mealRole: PlaceMealRole | null): boolean {
  return category === 'food' || mealRole === 'meal' || mealRole === 'light';
}

function notePage(target: CuratedTarget): ProfilePage {
  const lines = [target.whyGo, target.bestTime, target.crowdHint, ...target.tips];
  return {
    url: NOTE_URL,
    title: `${target.name}: the editors' note`,
    text: lines.filter((line): line is string => line !== null && line.trim() !== '').join('\n'),
  };
}

/** The dish the note says the place is known for, or null. */
async function readDish(
  deps: CuratedTypingDeps,
  target: CuratedTarget,
): Promise<{ dish: string | null; costMicros: number }> {
  const pages = [notePage(target)];
  const write = await deps.gateway.callModel(
    PLACE_PROFILE_ROUTES.fast,
    buildPlaceProfileRequest(profilePlace(target), pages, ['en']),
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkPlaceProfileReply(raw, {
    pages,
    locales: ['en'],
    second: null,
    website: target.website,
  });
  return {
    dish: checked.decision === 'write' ? checked.dish : null,
    costMicros: write.costMicros,
  };
}

export async function typeCuratedPlace(
  deps: CuratedTypingDeps,
  target: CuratedTarget,
): Promise<CuratedTyping> {
  const decision = await deps.decisions.decide(PLACE_LABELS_ROUTE, {
    state: {
      name: target.name,
      local_name: target.nameLocal,
      tags: target.tags,
      sources: target.sources,
      website: target.website,
      why_go: target.whyGo,
      best_time: target.bestTime,
    },
    questions: placeLabelQuestions(),
  });
  const floor = decisionBand(PLACE_LABELS_ROUTE, decision.answered_by).minConfidence;
  const { category, meal } = decision.answers;
  const mealRole = meal.confidence >= floor ? meal.choice : null;
  const dish = wantsDish(target.category, mealRole)
    ? await readDish(deps, target)
    : { dish: null, costMicros: 0 };
  return {
    category: category.confidence >= floor ? category.choice : null,
    mealRole,
    bestTimes: PLACE_BEST_TIMES.filter((t) => decision.answers[t].noul >= BEST_TIME_YES),
    visitMin: editorsVisitMin(target.timeNeededMin),
    dish: dish.dish,
    model: decision.answered_by,
    costMicros: decision.costMicros + dish.costMicros,
  };
}

/**
 * Saves the typed fields as a `reviewed_note` row. A ready profile from the web keeps its row;
 * returns whether the place was written.
 */
export async function saveCuratedTyping(
  pool: pg.Pool,
  poiId: string,
  t: CuratedTyping,
): Promise<boolean> {
  return withSystem(pool, async (tx) => {
    const result = await tx.query(
      `INSERT INTO place_profiles AS pp
              (poi_id, status, basis, category, meal_role, best_times, visit_min, dish, model,
               cost_micros, generated_at)
       VALUES ($1, 'ready', 'reviewed_note', $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (poi_id) DO UPDATE
          SET status = 'ready', basis = 'reviewed_note', texts = '{}', category = $2,
              meal_role = $3, best_times = $4, visit_min = $5, dish = $6, facts = '[]',
              dropped_facts = '[]', sources = '[]', second_source = NULL, photos = '[]',
              model = $7, cost_micros = pp.cost_micros + $8, error = NULL,
              generated_at = now(), updated_at = now()
        WHERE pp.basis = 'reviewed_note' OR pp.status <> 'ready'`,
      [poiId, t.category, t.mealRole, [...t.bestTimes], t.visitMin, t.dish, t.model, t.costMicros],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
