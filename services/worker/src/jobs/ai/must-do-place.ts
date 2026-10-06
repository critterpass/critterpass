/**
 * A must-do a member typed, decided once when it is set (`ai.fit_check`): our place search finds
 * up to five candidates in the trip's destination, and one typed decision (`must_do.resolve`, Jev
 * with its fast-tier twin) picks the place it means, or none, and reads the time of day its words
 * ask for. An unsure or empty place keeps it a wish, as before: the guide answers it in the
 * outline. An unsure time, or none named, leaves it untimed. The draft never reads the words.
 */
import {
  mustDoPlaceQuestion,
  mustDoTimeQuestion,
  type DecisionClient,
  type QuestionMap,
  type UsageContext,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { decisionBand, type PlaceBestTime } from '@cp/domain';
import type pg from 'pg';

export const MUST_DO_RESOLVE_ROUTE = 'must_do.resolve' as const;
export const MAX_MUST_DO_CANDIDATES = 5;
const KEYS = ['a', 'b', 'c', 'd', 'e'] as const;

export type MustDoDecisions = Pick<DecisionClient, 'decide'>;

export interface MustDoCandidate {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
}

export interface MustDoResolution {
  readonly poiId: string | null;
  readonly timeOfDay: PlaceBestTime | null;
}

const folded = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);

/**
 * Our place search for a typed title: any of its words (accents folded, the destination's own
 * name left out) in a place's name, or a name close to the whole title; best matches first.
 */
export async function searchMustDoPlaces(
  tx: pg.PoolClient,
  destinationId: string,
  destination: string,
  title: string,
): Promise<MustDoCandidate[]> {
  const city = new Set(folded(destination));
  const words = [...new Set(folded(title))].filter((word) => !city.has(word));
  if (words.length === 0) return [];
  const { rows } = await tx.query<{
    id: string;
    name: string;
    name_local: string | null;
    category: string;
  }>(
    `SELECT p.id, p.name, p.name_local, p.category
       FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
        AND p.category NOT IN ('transit', 'stay', 'health')
        AND (p.fts @@ to_tsquery('simple', $2) OR p.name % $3)
      ORDER BY ts_rank(p.fts, to_tsquery('simple', $2)) + similarity(p.name, $3) DESC,
               (p.curation = 'editorial') DESC, p.id
      LIMIT $4`,
    [destinationId, words.join(' | '), title, MAX_MUST_DO_CANDIDATES],
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    nameLocal: row.name_local,
    category: row.category,
  }));
}

/** The place and time of day a typed must-do means, from the candidates our search found. */
export async function resolveMustDo(
  decisions: MustDoDecisions,
  input: {
    readonly title: string;
    readonly destination: string;
    readonly candidates: readonly MustDoCandidate[];
  },
  usage: UsageContext = {},
): Promise<MustDoResolution> {
  const candidates = input.candidates.slice(0, MAX_MUST_DO_CANDIDATES);
  const keys = KEYS.slice(0, candidates.length);
  const questions: QuestionMap = {
    time: mustDoTimeQuestion(),
    ...(keys.length === 0 ? {} : { place: mustDoPlaceQuestion(keys) }),
  };
  const decision = await decisions.decide(
    MUST_DO_RESOLVE_ROUTE,
    {
      state: {
        must_do: input.title,
        destination: input.destination,
        candidates: Object.fromEntries(
          candidates.map((poi, index) => [
            keys[index],
            { name: poi.name, local_name: poi.nameLocal, category: poi.category },
          ]),
        ),
      },
      questions,
    },
    usage,
  );
  const floor = decisionBand(MUST_DO_RESOLVE_ROUTE, decision.answered_by).minConfidence;
  const answer = (key: string) => {
    const given = decision.answers[key];
    return given?.type === 'choice' && given.confidence >= floor ? given.choice : null;
  };
  const place = answer('place');
  const picked = place === null ? -1 : (keys as readonly string[]).indexOf(place);
  const time = answer('time');
  return {
    poiId: candidates[picked]?.id ?? null,
    timeOfDay: time === null || time === 'any' ? null : (time as PlaceBestTime),
  };
}

/**
 * Decides every typed must-do of a trip that has no place yet, and stores what was decided on its
 * row: `poi_id` when a place was picked (it is then no longer freeform) and `time_of_day`. The
 * search runs first, the decisions outside any transaction, and a row edited meanwhile (its title
 * changed, or a place set) is left for the check its edit queued. A decision that cannot be had
 * leaves that row as it was.
 */
export async function resolveTypedMustDos(
  pool: pg.Pool,
  tripId: string,
  decisions: MustDoDecisions,
): Promise<{ readonly resolved: number; readonly placed: number }> {
  const asked = await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      title: string;
      destination_id: string | null;
      destination: string | null;
    }>(
      `SELECT m.id, m.title, t.destination_id, d.name AS destination
         FROM must_dos m JOIN trips t ON t.id = m.trip_id
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE m.trip_id = $1 AND m.deleted_at IS NULL AND m.freeform AND m.poi_id IS NULL
        ORDER BY m.created_at, m.id`,
      [tripId],
    );
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        title: row.title,
        destination: row.destination ?? '',
        candidates:
          row.destination_id === null
            ? []
            : await searchMustDoPlaces(tx, row.destination_id, row.destination ?? '', row.title),
      })),
    );
  });
  const decided: { readonly id: string; readonly title: string; readonly r: MustDoResolution }[] =
    [];
  for (const row of asked) {
    try {
      decided.push({
        id: row.id,
        title: row.title,
        r: await resolveMustDo(decisions, row, { tripId }),
      });
    } catch {
      // Left as it was: still a wish, untimed; the next check asks again.
    }
  }
  if (decided.length === 0) return { resolved: 0, placed: 0 };
  let placed = 0;
  await withSystem(pool, async (tx) => {
    for (const { id, title, r } of decided) {
      const { rowCount } = await tx.query(
        `UPDATE must_dos SET poi_id = $3, freeform = ($3::uuid IS NULL), time_of_day = $4
          WHERE id = $1 AND title = $2 AND poi_id IS NULL AND deleted_at IS NULL`,
        [id, title, r.poiId, r.timeOfDay],
      );
      if ((rowCount ?? 0) > 0 && r.poiId !== null) placed += 1;
    }
  });
  return { resolved: decided.length, placed };
}
