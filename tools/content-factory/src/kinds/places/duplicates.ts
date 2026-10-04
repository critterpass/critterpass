/**
 * Cross-language duplicate sweep: two active POIs of a destination at most 60 m apart whose names
 * barely overlap (trigram similarity under 0.6, e.g. "Chùa Cầu" and "Japanese Covered Bridge") are
 * put to the `poi.duplicate_tiebreak` decision, many pairs per call. A sure yes merges them on
 * publish; the gray band goes to the reviewer; a no leaves both. Answers are cached per pair.
 * The sources also list one business twice under nearly the same name, a street or more apart
 * ("Nem Nướng Bà Hùng", "Nem Nuong Ba Hung"): pairs within 400 m whose unaccented names are alike,
 * and within 1.5 km when they are nearly the same, go to the same decision, as does every record
 * near a landmark that carries its name.
 *
 * Long features (beaches, mountains, parks) run for a kilometre or more, and each source drops its
 * point somewhere along them: Mỹ Khê's three records lie up to 1.4 km apart. Within 1.5 km, two
 * such places whose names say the same once accents, place types ("beach", "bãi biển") and the
 * city are dropped are one place and merge without a decision; two that match the same Wikidata
 * item under other names go to the decision. Neighbouring beaches are kept apart by their own
 * names (Phạm Văn Đồng, Non Nước), not by the radius.
 */
import path from 'node:path';

import { noul, type DecisionClient } from '@cp/ai';
import { decisionBand, yesNoVerdict } from '@cp/domain';
import { sha256Hex } from '@cp/content';
import type pg from 'pg';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';
import { distanceM, matchPlace, tellingWords, type WikidataPoint } from '../media/place-match';

export const DUPLICATE_DISTANCE_M = 60;
export const DUPLICATE_MAX_NAME_SIMILARITY = 0.6;
export const SAME_NAME_DISTANCE_M = 400;
export const SAME_NAME_MIN_SIMILARITY = 0.5;
export const NEAR_IDENTICAL_DISTANCE_M = 1500;
export const NEAR_IDENTICAL_MIN_SIMILARITY = 0.75;
const PAIRS_PER_CALL = 20;

export interface PoiPairSide {
  readonly ref: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
}

export interface DuplicatePair {
  readonly a: PoiPairSide;
  readonly b: PoiPairSide;
  readonly distanceM: number;
}

export type DuplicateVerdict = 'merge' | 'review' | 'distinct';

export const LONG_FEATURE_DISTANCE_M = 1500;
const LONG_FEATURES = new Set(['beach', 'nature']);

export interface DuplicatePlace extends PoiPairSide {
  readonly lat: number;
  readonly lng: number;
}

/**
 * The long-feature duplicates among `places`: `merges` (same name, folded) point each record at
 * the group's shortest-named one; `pairs` (same Wikidata item, other names) need a decision.
 */
export function longFeatureDuplicates(
  places: readonly DuplicatePlace[],
  items: readonly WikidataPoint[],
): { merges: { from: string; into: string }[]; pairs: DuplicatePair[] } {
  const long = places.filter((p) => LONG_FEATURES.has(p.category));
  const core = new Map(
    long.map((p) => [p.ref, [...new Set(tellingWords(p.name))].sort().join(' ')]),
  );
  const item = new Map(long.map((p) => [p.ref, matchPlace(p, items)?.item.id ?? null]));
  const group = new Map(long.map((p) => [p.ref, p]));
  const root = (place: DuplicatePlace): DuplicatePlace => {
    const parent = group.get(place.ref) ?? place;
    return parent.ref === place.ref ? place : root(parent);
  };
  const shorter = (a: DuplicatePlace, b: DuplicatePlace) =>
    a.name.length < b.name.length || (a.name.length === b.name.length && a.ref < b.ref);
  const near: [DuplicatePlace, DuplicatePlace, number][] = [];
  long.forEach((a, i) => {
    for (const b of long.slice(i + 1)) {
      const distance = Math.round(distanceM(a, b));
      if (distance <= LONG_FEATURE_DISTANCE_M) near.push([a, b, distance]);
    }
  });
  for (const [a, b] of near) {
    const name = core.get(a.ref) ?? '';
    if (name === '' || name !== core.get(b.ref)) continue;
    const [ra, rb] = [root(a), root(b)];
    if (ra.ref === rb.ref) continue;
    if (shorter(ra, rb)) group.set(rb.ref, ra);
    else group.set(ra.ref, rb);
  }
  const merges = long.flatMap((p) => {
    const into = root(p);
    return into.ref === p.ref ? [] : [{ from: p.ref, into: into.ref }];
  });
  const side = (p: DuplicatePlace): PoiPairSide => ({
    ref: p.ref,
    name: p.name,
    nameLocal: p.nameLocal,
    category: p.category,
  });
  const pairs = near
    .filter(([a, b]) => {
      const id = item.get(a.ref) ?? null;
      return id !== null && id === item.get(b.ref) && root(a).ref !== root(b).ref;
    })
    .map(([a, b, distance]) => ({ a: side(a), b: side(b), distanceM: distance }));
  return { merges, pairs };
}

const refOf = (sourceIds: Record<string, string>): string => {
  for (const source of ['editorial', 'fsq_os', 'overture'] as const) {
    const id = sourceIds[source];
    if (id !== undefined) return `${source}:${id}`;
  }
  return '';
};

export async function nearbyPairs(
  pool: pg.Pool,
  destinationId: string,
  /** Only pairs where both places are among these (the curated set). */
  poiIds: readonly string[],
): Promise<DuplicatePair[]> {
  const { rows } = await pool.query<{
    a_ids: Record<string, string>;
    a_name: string;
    a_local: string | null;
    a_category: string;
    b_ids: Record<string, string>;
    b_name: string;
    b_local: string | null;
    b_category: string;
    distance: number;
  }>(
    `SELECT a.source_ids AS a_ids, a.name AS a_name, a.name_local AS a_local, a.category AS a_category,
       b.source_ids AS b_ids, b.name AS b_name, b.name_local AS b_local, b.category AS b_category,
       ST_Distance(a.location, b.location) AS distance
     FROM pois a JOIN pois b ON a.id < b.id AND b.destination_id = a.destination_id
       AND ST_DWithin(a.location, b.location, $7)
     WHERE a.destination_id = $1 AND a.status = 'active' AND b.status = 'active'
       AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL
       AND a.id = ANY($4::uuid[]) AND b.id = ANY($4::uuid[])
       AND ((ST_DWithin(a.location, b.location, $2) AND similarity(a.name, b.name) < $3)
         OR similarity(app.unaccent_immutable(lower(a.name)), app.unaccent_immutable(lower(b.name)))
           >= CASE WHEN ST_DWithin(a.location, b.location, $5) THEN $6::real ELSE $8::real END)
     ORDER BY distance`,
    [
      destinationId,
      DUPLICATE_DISTANCE_M,
      DUPLICATE_MAX_NAME_SIMILARITY,
      poiIds,
      SAME_NAME_DISTANCE_M,
      SAME_NAME_MIN_SIMILARITY,
      NEAR_IDENTICAL_DISTANCE_M,
      NEAR_IDENTICAL_MIN_SIMILARITY,
    ],
  );
  return rows
    .map((row) => ({
      a: {
        ref: refOf(row.a_ids),
        name: row.a_name,
        nameLocal: row.a_local,
        category: row.a_category,
      },
      b: {
        ref: refOf(row.b_ids),
        name: row.b_name,
        nameLocal: row.b_local,
        category: row.b_category,
      },
      distanceM: Math.round(row.distance),
    }))
    .filter((pair) => pair.a.ref !== '' && pair.b.ref !== '');
}

const cacheFile = (pair: DuplicatePair) =>
  path.join(
    FACTORY_DIR,
    'work',
    'decision-cache',
    `${sha256Hex(`${pair.a.ref}|${pair.b.ref}`).slice(0, 32)}.json`,
  );

/** Decides every pair; cached pairs never call again. */
export async function decideDuplicates(
  client: DecisionClient | null,
  pairs: readonly DuplicatePair[],
): Promise<Map<string, DuplicateVerdict>> {
  const verdicts = new Map<string, DuplicateVerdict>();
  const open: DuplicatePair[] = [];
  for (const pair of pairs) {
    const cached = readJsonIfExists<{ verdict: DuplicateVerdict }>(cacheFile(pair));
    if (cached === undefined) open.push(pair);
    else verdicts.set(`${pair.a.ref}|${pair.b.ref}`, cached.verdict);
  }
  if (open.length === 0) return verdicts;
  if (client === null) throw new Error('duplicate decisions need the decision client');
  for (let start = 0; start < open.length; start += PAIRS_PER_CALL) {
    const chunk = open.slice(start, start + PAIRS_PER_CALL);
    const questions = Object.fromEntries(
      chunk.map((_, i) => [
        `pair_${i}`,
        noul(
          `Are pair_${i}'s two records the same real-world place (one venue, possibly named in two languages)?`,
          {
            true: 'the same venue, landmark or business',
            false: 'two different places that happen to be close together',
          },
        ),
      ]),
    );
    const state = Object.fromEntries(
      chunk.map((pair, i) => [
        `pair_${i}`,
        { first: pair.a, second: pair.b, metres_apart: pair.distanceM },
      ]),
    );
    const decision = await client.decide('poi.duplicate_tiebreak', { state, questions });
    const band = decisionBand('poi.duplicate_tiebreak', decision.answered_by);
    chunk.forEach((pair, i) => {
      const answer = decision.answers[`pair_${i}`];
      const p = answer?.type === 'noul' ? answer.noul : 0.5;
      const verdict = yesNoVerdict(p, band);
      const mapped: DuplicateVerdict =
        verdict === 'yes' ? 'merge' : verdict === 'no' ? 'distinct' : 'review';
      verdicts.set(`${pair.a.ref}|${pair.b.ref}`, mapped);
      writeJson(cacheFile(pair), { verdict: mapped, p });
    });
  }
  return verdicts;
}

/**
 * Further than this from its landmark, a record using the landmark's name has a wrong point or is
 * another place: Sơn Trà's own coast lies 3–4 km from the mountain's Wikidata point.
 */
export const FAR_NAMESAKE_M = 5000;

/**
 * Curated records that name a landmark in full but lie far from it (the open data puts a "Hải Vân
 * pass" in the city, 13 km from the pass): each merges into the landmark's own place. Pinned
 * places keep their hand-checked points.
 */
export function farNamesakes(
  places: readonly DuplicatePlace[],
  landmarks: readonly { readonly item: WikidataPoint; readonly ref: string }[],
  pinned: ReadonlySet<string>,
): { from: string; into: string }[] {
  return places.flatMap((place) => {
    if (pinned.has(place.ref)) return [];
    const landmark = landmarks.find(
      ({ item, ref }) =>
        ref !== place.ref &&
        distanceM(place, item) > FAR_NAMESAKE_M &&
        matchPlace({ ...place, lat: item.lat, lng: item.lng }, [item], true) !== null,
    );
    return landmark === undefined ? [] : [{ from: place.ref, into: landmark.ref }];
  });
}

/**
 * Records that carry a landmark's name on its ground (the lake's park, its viewpoint, the same
 * sight under another category), each paired with the landmark's place for the decision. Pinned
 * places and other landmarks' places are left alone.
 */
export function landmarkNamesakes(
  places: readonly DuplicatePlace[],
  landmarks: readonly { readonly item: WikidataPoint; readonly ref: string }[],
  pinned: ReadonlySet<string>,
): DuplicatePair[] {
  const side = ({ ref, name, nameLocal, category }: DuplicatePlace): PoiPairSide => ({
    ref,
    name,
    nameLocal,
    category,
  });
  const taken = new Set(landmarks.map((l) => l.ref));
  return landmarks.flatMap(({ item, ref }) => {
    const own = places.find((place) => place.ref === ref);
    if (own === undefined) return [];
    return places
      .filter((p) => !taken.has(p.ref) && !pinned.has(p.ref) && matchPlace(p, [item]) !== null)
      .map((p) => ({ a: side(own), b: side(p), distanceM: Math.round(distanceM(own, p)) }));
  });
}
