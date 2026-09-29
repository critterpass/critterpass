/**
 * Cross-language duplicate sweep: two active POIs of a destination at most 60 m apart whose names
 * barely overlap (trigram similarity under 0.6, e.g. "Chùa Cầu" and "Japanese Covered Bridge") are
 * put to the `poi.duplicate_tiebreak` decision, many pairs per call. A sure yes merges them on
 * publish; the gray band goes to the reviewer; a no leaves both. Answers are cached per pair.
 */
import path from 'node:path';

import { noul, type DecisionClient } from '@cp/ai';
import { decisionBand, yesNoVerdict } from '@cp/domain';
import { sha256Hex } from '@cp/content';
import type pg from 'pg';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

export const DUPLICATE_DISTANCE_M = 60;
export const DUPLICATE_MAX_NAME_SIMILARITY = 0.6;
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

const refOf = (sourceIds: Record<string, string>): string => {
  for (const source of ['editorial', 'fsq_os', 'overture'] as const) {
    const id = sourceIds[source];
    if (id !== undefined) return `${source}:${id}`;
  }
  return '';
};

export async function nearbyDifferentNames(
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
       AND ST_DWithin(a.location, b.location, $2)
     WHERE a.destination_id = $1 AND a.status = 'active' AND b.status = 'active'
       AND a.merged_into_id IS NULL AND b.merged_into_id IS NULL
       AND a.id = ANY($4::uuid[]) AND b.id = ANY($4::uuid[])
       AND similarity(a.name, b.name) < $3
     ORDER BY distance`,
    [destinationId, DUPLICATE_DISTANCE_M, DUPLICATE_MAX_NAME_SIMILARITY, poiIds],
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
