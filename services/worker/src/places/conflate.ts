/**
 * Pure POI conflation: matches candidates by name trigram similarity >= 0.6, distance <= 60 m and
 * category compatibility. No I/O: `ingest.ts` feeds this the rows it read from FSQ OS Places and
 * Overture for one destination bbox, and writes the result; this file only decides which rows are
 * the same real-world place.
 *
 * `trigramSimilarity` mirrors `pg_trgm`'s own algorithm (Jaccard index over padded 3-grams) closely
 * enough to threshold at the same 0.6, without a database round trip per candidate pair —
 * conflation runs once per ingest over a bbox-sized batch (hundreds to low thousands of rows per
 * source), not a hot query path, so an in-process approximation is the right trade-off; the
 * search-time ranking in `services/api/src/places/search.ts` uses the real `pg_trgm` GIN index
 * instead.
 */
import { mapSourceCategoriesToTaxonomy, type PoiCategory, type PoiSourceIds } from '@cp/domain';

export interface ConflationCandidate {
  readonly sourceId: string;
  readonly name: string;
  /** Raw source category labels/slugs, most-specific first; mapped via `mapSourceCategoriesToTaxonomy`. */
  readonly categoryLabels: readonly string[];
  readonly lat: number;
  readonly lng: number;
  readonly address?: string | undefined;
}

export interface ConflatedPoi {
  readonly name: string;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address?: string | undefined;
  readonly sourceIds: PoiSourceIds;
}

const NAME_SIMILARITY_THRESHOLD = 0.6;
const DISTANCE_THRESHOLD_M = 60;
const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in meters (haversine); accurate enough at the <1 km scale conflation needs. */
export function haversineDistanceM(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

function paddedTrigrams(text: string): ReadonlySet<string> {
  const normalised = `  ${text.toLowerCase().trim()}  `;
  const grams = new Set<string>();
  for (let index = 0; index <= normalised.length - 3; index += 1) {
    grams.add(normalised.slice(index, index + 3));
  }
  return grams;
}

/** Jaccard similarity over padded 3-grams, in `[0, 1]`; same shape as `pg_trgm`'s `similarity()`. */
export function trigramSimilarity(a: string, b: string): number {
  const gramsA = paddedTrigrams(a);
  const gramsB = paddedTrigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;
  let common = 0;
  for (const gram of gramsA) if (gramsB.has(gram)) common += 1;
  const union = gramsA.size + gramsB.size - common;
  return union === 0 ? 0 : common / union;
}

/** Two categories may describe the same place if equal, or either failed to map (stays permissive). */
export function categoriesCompatible(a: PoiCategory, b: PoiCategory): boolean {
  return a === b || a === 'other' || b === 'other';
}

function resolveCategory(candidate: ConflationCandidate): PoiCategory {
  return mapSourceCategoriesToTaxonomy(candidate.categoryLabels);
}

/**
 * Spatial buckets for candidate lookup: cells at least `DISTANCE_THRESHOLD_M` wide in both axes, so
 * every match lies in a candidate's own cell or one of its eight neighbours. A metro bbox carries
 * hundreds of thousands of rows per source; comparing every pair would never finish.
 */
const CELL_LAT_DEG = 0.001; // about 111 m
function cellSizes(rows: readonly ConflationCandidate[]): { lat: number; lng: number } {
  let maxAbsLat = 0;
  for (const row of rows) maxAbsLat = Math.max(maxAbsLat, Math.abs(row.lat));
  const cos = Math.max(0.1, Math.cos(toRadians(Math.min(maxAbsLat, 89))));
  return { lat: CELL_LAT_DEG, lng: CELL_LAT_DEG / cos };
}

/**
 * Matches FSQ OS Places rows against Overture rows for the same bbox and merges every matched pair
 * into one conflated POI carrying both source ids; unmatched rows from either source become their
 * own conflated POI with a single source id. FSQ's name/address win on a match; Overture only fills
 * a gap FSQ left blank.
 */
export function conflatePlaces(
  fsqCandidates: readonly ConflationCandidate[],
  overtureCandidates: readonly ConflationCandidate[],
): readonly ConflatedPoi[] {
  const matchedOvertureIndexes = new Set<number>();
  const conflated: ConflatedPoi[] = [];
  const overtureCategories = overtureCandidates.map(resolveCategory);
  const cell = cellSizes([...fsqCandidates, ...overtureCandidates]);
  const cellOf = (row: { readonly lat: number; readonly lng: number }) =>
    [Math.floor(row.lat / cell.lat), Math.floor(row.lng / cell.lng)] as const;
  const buckets = new Map<string, number[]>();
  overtureCandidates.forEach((overture, index) => {
    const [y, x] = cellOf(overture);
    const key = `${y}:${x}`;
    const bucket = buckets.get(key);
    if (bucket === undefined) buckets.set(key, [index]);
    else bucket.push(index);
  });

  for (const fsq of fsqCandidates) {
    const fsqCategory = resolveCategory(fsq);
    let bestIndex = -1;
    let bestScore = -1;

    const [y, x] = cellOf(fsq);
    const nearby: number[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1)
        nearby.push(...(buckets.get(`${y + dy}:${x + dx}`) ?? []));
    }
    // Ascending index order keeps the first-seen candidate on a score tie.
    nearby.sort((a, b) => a - b);
    for (const index of nearby) {
      const overture = overtureCandidates[index];
      const overtureCategory = overtureCategories[index];
      if (overture === undefined || overtureCategory === undefined) continue;
      if (matchedOvertureIndexes.has(index)) continue;
      if (!categoriesCompatible(fsqCategory, overtureCategory)) continue;
      const distanceM = haversineDistanceM(fsq, overture);
      if (distanceM > DISTANCE_THRESHOLD_M) continue;
      const similarity = trigramSimilarity(fsq.name, overture.name);
      if (similarity < NAME_SIMILARITY_THRESHOLD) continue;
      // Among several passing candidates, prefer the closer and more name-similar one.
      const score = similarity - distanceM / (DISTANCE_THRESHOLD_M * 10);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex === -1) {
      conflated.push({
        name: fsq.name,
        category: fsqCategory,
        lat: fsq.lat,
        lng: fsq.lng,
        address: fsq.address,
        sourceIds: { fsq_os: fsq.sourceId },
      });
      continue;
    }

    const overture = overtureCandidates[bestIndex];
    if (overture === undefined) continue; // unreachable: bestIndex only ever indexes overtureCandidates
    matchedOvertureIndexes.add(bestIndex);
    conflated.push({
      name: fsq.name,
      category: fsqCategory,
      lat: fsq.lat,
      lng: fsq.lng,
      address: fsq.address ?? overture.address,
      sourceIds: { fsq_os: fsq.sourceId, overture: overture.sourceId },
    });
  }

  overtureCandidates.forEach((overture, index) => {
    if (matchedOvertureIndexes.has(index)) return;
    conflated.push({
      name: overture.name,
      category: overtureCategories[index] ?? resolveCategory(overture),
      lat: overture.lat,
      lng: overture.lng,
      address: overture.address,
      sourceIds: { overture: overture.sourceId },
    });
  });

  return conflated;
}
