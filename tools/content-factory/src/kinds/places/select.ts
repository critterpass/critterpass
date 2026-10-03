/**
 * Which imported POIs of a destination become curated. The importer keeps every open-data place in
 * the destination's bbox (tens to hundreds of thousands per city); the curated set is a few hundred
 * spread over sights, temples, food, nightlife, nature and practical stops. Candidates come from the
 * database (chains, i.e. a name used three or more times in a bucket, are left out; a bucket's
 * first category comes first, so museums and monuments precede the catch-all, then places both
 * open datasets agree on), the model scores each candidate's interest to a visitor
 * from its name, category and address alone, and each bucket takes its share of the city target by
 * score. Pinned places and the destination's landmarks (./landmarks) are in whatever their bucket
 * or score. Scores are cached per request, so a rerun makes no model calls.
 */
import path from 'node:path';

import { runBatch, textOf, type Gateway } from '@cp/ai';
import { canonicalJson, sha256Hex } from '@cp/content';
import type { PoiCategory } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

export const DEFAULT_POIS_PER_CITY = 400;
const MAX_CANDIDATES_PER_BUCKET = 2000;
const CANDIDATES_PER_CALL = 250;
const SELECTION_ROUTE = 'content.factory';

export const CURATED_BUCKETS: readonly {
  readonly id: string;
  readonly categories: readonly PoiCategory[];
  readonly share: number;
}[] = [
  { id: 'sights', categories: ['museum', 'other'], share: 0.2 },
  { id: 'temples', categories: ['temple_shrine'], share: 0.15 },
  { id: 'food', categories: ['food', 'market'], share: 0.27 },
  { id: 'nightlife', categories: ['nightlife'], share: 0.12 },
  { id: 'nature', categories: ['nature', 'beach'], share: 0.15 },
  { id: 'practical', categories: ['transit', 'health'], share: 0.11 },
];

export interface SelectionCandidate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly address: string | null;
  /** Both FSQ OS Places and Overture list the place. */
  readonly corroborated: boolean;
  /** Already curated by an earlier batch: always kept. */
  readonly editorial: boolean;
}

export async function selectionCandidates(
  pool: pg.Pool,
  destinationId: string,
  categories: readonly string[],
  limit = MAX_CANDIDATES_PER_BUCKET,
): Promise<SelectionCandidate[]> {
  const { rows } = await pool.query<SelectionCandidate>(
    `WITH counted AS (
       SELECT id, name, category, address, source_ids, curation,
         count(*) OVER (PARTITION BY lower(name)) AS same_name
       FROM pois
       WHERE destination_id = $1 AND status = 'active' AND merged_into_id IS NULL
         AND category = ANY($2::text[]) AND char_length(name) >= 3
     )
     SELECT id, name, category, address,
       (source_ids ? 'fsq_os' AND source_ids ? 'overture') AS corroborated,
       curation = 'editorial' AS editorial
     FROM counted
     WHERE curation = 'editorial' OR same_name < 3
     ORDER BY curation = 'editorial' DESC, array_position($2::text[], category),
       corroborated DESC, address IS NOT NULL DESC, md5(source_ids::text), id
     LIMIT $3`,
    [destinationId, categories, limit],
  );
  return rows;
}

const scoresSchema = z.object({
  picks: z.array(z.object({ n: z.number().int().min(1), score: z.number().int().min(1).max(3) })),
});

const SYSTEM = `You pick places worth a traveller's time from a numbered list of open-data places in one destination (name, category, address).
Score each place you would put in a curated city guide: 3 = famous landmark or must-see, 2 = well known or locally loved, 1 = a solid, useful choice. Leave out places you do not recognise as notable, generic businesses, offices, residential buildings and anything that looks like a data error.
For practical places (stations, hospitals, pharmacies) score the ones a visitor would realistically need. Reply with JSON only: {"picks": [{"n": <number>, "score": <1-3>}]}.`;

function scoringRequest(destination: string, chunk: readonly SelectionCandidate[]) {
  const list = chunk
    .map((c, i) => `${i + 1}. ${c.name} · ${c.category}${c.address ? ` · ${c.address}` : ''}`)
    .join('\n');
  return {
    system: SYSTEM,
    user: `Destination: ${destination}.\nPlaces:\n${list}`,
    jsonSchema: {
      type: 'object',
      properties: {
        picks: {
          type: 'array',
          items: {
            type: 'object',
            properties: { n: { type: 'integer' }, score: { type: 'integer' } },
            required: ['n', 'score'],
            additionalProperties: false,
          },
        },
      },
      required: ['picks'],
      additionalProperties: false,
    },
  };
}

type ScoringRequest = ReturnType<typeof scoringRequest>;
const DEFAULT_CACHE_DIR = path.join(FACTORY_DIR, 'work', 'selection-cache');
const cacheFile = (dir: string, request: ScoringRequest) =>
  path.join(
    dir,
    `${sha256Hex(canonicalJson({ route: SELECTION_ROUTE, ...request })).slice(0, 32)}.json`,
  );

export interface ScoreOptions {
  readonly gateway: Gateway | null;
  readonly maxCostMicros: number;
  readonly concurrency?: number;
  readonly log?: (line: string) => void;
  /** Where scored chunks are cached (defaults to the factory's work dir). */
  readonly cacheDir?: string;
}

/** Scores candidates by id (unscored = not picked). Cached chunks never call the model again. */
export async function scoreCandidates(
  destination: string,
  candidates: readonly SelectionCandidate[],
  options: ScoreOptions,
): Promise<{ scores: Map<string, number>; costMicros: number; calls: number }> {
  const scores = new Map<string, number>();
  const cacheDir = options.cacheDir ?? DEFAULT_CACHE_DIR;
  const pending: { chunk: SelectionCandidate[]; request: ScoringRequest }[] = [];
  const apply = (chunk: readonly SelectionCandidate[], picks: z.infer<typeof scoresSchema>) => {
    for (const pick of picks.picks) {
      const candidate = chunk[pick.n - 1];
      if (candidate !== undefined) scores.set(candidate.id, pick.score);
    }
  };
  for (let start = 0; start < candidates.length; start += CANDIDATES_PER_CALL) {
    const chunk = candidates.slice(start, start + CANDIDATES_PER_CALL);
    const request = scoringRequest(destination, chunk);
    const cached = scoresSchema.safeParse(readJsonIfExists(cacheFile(cacheDir, request)));
    if (cached.success) apply(chunk, cached.data);
    else pending.push({ chunk, request });
  }
  if (pending.length === 0) return { scores, costMicros: 0, calls: 0 };
  if (options.gateway === null)
    throw new Error('POI selection needs the model: set ANTHROPIC_API_KEY');

  let costMicros = 0;
  let failed = 0;
  const abort = new AbortController();
  let batchError: unknown = null;
  try {
    await runBatch(
      options.gateway,
      SELECTION_ROUTE,
      pending.map((entry, index) => ({
        customId: `s${index}`,
        input: {
          system: entry.request.system,
          messages: [{ role: 'user', content: entry.request.user }],
          outputFormat: { type: 'json_schema', schema: entry.request.jsonSchema },
        },
      })),
      {
        concurrency: options.concurrency ?? 8,
        signal: abort.signal,
        onResult: (result) => {
          const entry = pending[Number(result.customId.slice(1))];
          if (entry === undefined || result.type !== 'succeeded') {
            failed += 1;
            return Promise.resolve();
          }
          costMicros += result.costMicros;
          const parsed = scoresSchema.safeParse(parseJson(textOf(result.message)));
          if (parsed.success) {
            apply(entry.chunk, parsed.data);
            writeJson(cacheFile(cacheDir, entry.request), parsed.data);
          } else failed += 1;
          if (costMicros >= options.maxCostMicros) abort.abort();
          return Promise.resolve();
        },
      },
    );
  } catch (error) {
    // An aborted batch (cost cap) rejects its in-flight calls; the message below covers it.
    if (!abort.signal.aborted) batchError = error;
  }
  if (abort.signal.aborted || failed > 0 || batchError !== null) {
    const inner =
      batchError instanceof Error && batchError.cause instanceof Error
        ? ` (${batchError.cause.message})`
        : '';
    const cause = batchError instanceof Error ? `; ${batchError.message}${inner}` : '';
    throw new Error(
      `POI selection for ${destination} stopped (${failed} failed calls, $${(costMicros / 1e6).toFixed(2)} spent${cause}): rerun to finish from the cache`,
      { cause: batchError },
    );
  }
  options.log?.(
    `select ${destination}: ${pending.length} scoring calls · $${(costMicros / 1e6).toFixed(3)}`,
  );
  return { scores, costMicros, calls: pending.length };
}

function parseJson(text: string): unknown {
  const body = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  try {
    return JSON.parse(body.trim());
  } catch {
    return undefined;
  }
}

/**
 * Fills the city target: the must-includes (pinned places, the destination's landmarks) first,
 * whatever their bucket or score; then each bucket takes its share by score (editorial first, then
 * score, then source agreement); unused share goes to the best remaining scored places of any
 * bucket, then to unscored ones so a thin city still reaches its target from what the open data
 * holds.
 */
export function pickCurated(
  buckets: readonly {
    readonly share: number;
    readonly candidates: readonly SelectionCandidate[];
  }[],
  scores: ReadonlyMap<string, number>,
  target: number,
  mustInclude: readonly string[] = [],
): string[] {
  const rank = (c: SelectionCandidate) =>
    (c.editorial ? 100 : 0) + (scores.get(c.id) ?? 0) * 10 + (c.corroborated ? 1 : 0);
  const ranked = buckets.map((bucket) => ({
    share: bucket.share,
    list: [...bucket.candidates].sort((a, b) => rank(b) - rank(a)),
  }));
  const chosen = new Set<string>(mustInclude);
  const open = Math.max(0, target - chosen.size);
  const worth = (c: SelectionCandidate) => !chosen.has(c.id) && (c.editorial || scores.has(c.id));
  for (const bucket of ranked) {
    const quota = Math.floor(bucket.share * open);
    for (const c of bucket.list.filter(worth).slice(0, quota)) chosen.add(c.id);
  }
  const rest = ranked
    .flatMap((bucket) => bucket.list)
    .filter((c) => !chosen.has(c.id))
    .sort((a, b) => rank(b) - rank(a));
  for (const c of rest) {
    if (chosen.size >= target) break;
    chosen.add(c.id);
  }
  return [...chosen];
}

/** The curated POI ids of one destination, `mustInclude` among them. */
export async function selectCurated(
  pool: pg.Pool,
  destination: { readonly id: string; readonly slug: string },
  target: number,
  options: ScoreOptions,
  mustInclude: readonly string[] = [],
): Promise<string[]> {
  const buckets = [];
  for (const bucket of CURATED_BUCKETS) {
    buckets.push({
      share: bucket.share,
      candidates: await selectionCandidates(pool, destination.id, bucket.categories),
    });
  }
  const all = buckets.flatMap((bucket) => bucket.candidates);
  if (all.length + mustInclude.length <= target)
    return [...new Set([...mustInclude, ...all.map((c) => c.id)])];
  const { scores } = await scoreCandidates(
    destination.slug,
    all.filter((c) => !c.editorial),
    options,
  );
  return pickCurated(buckets, scores, target, mustInclude);
}
