/**
 * Choosing the Foursquare place behind one of our POIs from a nearby name search. Foursquare's own
 * Place Match endpoint needs a street address, city and country code, which many curated POIs lack,
 * so the worker searches by name around the POI's point instead and this module decides: the best
 * candidate's name must closely match ours (our name or its local-script name) within the search
 * radius. Only the `fsq_place_id` is kept (the one attribute Foursquare lets us store).
 */

/** Below this a candidate is not trusted to be the same place. */
export const FOURSQUARE_MATCH_FLOOR = 0.7;
/** Search radius around the POI's point, in metres. */
export const FOURSQUARE_MATCH_RADIUS_M = 250;

export interface FoursquareMatchCandidate {
  readonly fsqPlaceId: string;
  readonly name: string;
  /** Metres from the POI's point, as Foursquare reports it. */
  readonly distance: number;
}

export interface FoursquareMatch {
  readonly fsqPlaceId: string;
  readonly confidence: number;
}

/** Lowercase, unaccented words; a parenthesised part ("Fushimi Inari (伏見稲荷大社)") is its own name. */
function nameVariants(name: string): string[] {
  const variants = [name.replace(/\([^)]*\)/gu, ' ')];
  for (const match of name.matchAll(/\(([^)]*)\)/gu)) if (match[1]) variants.push(match[1]);
  return variants.map(normalise).filter((variant) => variant.length > 0);
}

function normalise(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(value: string): Set<string> {
  return new Set(value.split(' ').filter((token) => token.length > 0));
}

function bigrams(value: string): Set<string> {
  const chars = [...value];
  const pairs = new Set<string>();
  for (let index = 0; index + 1 < chars.length; index += 1) {
    pairs.add(`${chars[index]}${chars[index + 1]}`);
  }
  return pairs;
}

/** Dice similarity of two normalised names: word overlap, or character pairs for single words. */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const spaced = a.includes(' ') || b.includes(' ');
  const left = spaced ? tokens(a) : bigrams(a);
  const right = spaced ? tokens(b) : bigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/** How alike a candidate's name is to any of our names, 0–1. */
export function nameSimilarity(ours: readonly string[], theirs: string): number {
  const theirVariants = nameVariants(theirs);
  let best = 0;
  for (const name of ours) {
    for (const mine of nameVariants(name)) {
      for (const candidate of theirVariants) best = Math.max(best, similarity(mine, candidate));
    }
  }
  return best;
}

/**
 * The candidate that is the same place, or null. Confidence is the name similarity, lowered by up
 * to a fifth as the candidate sits further out in the search radius; ties go to the nearer one.
 */
export function pickFoursquareMatch(
  ours: readonly string[],
  candidates: readonly FoursquareMatchCandidate[],
): FoursquareMatch | null {
  let best: FoursquareMatch | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate.distance > FOURSQUARE_MATCH_RADIUS_M) continue;
    const distancePenalty = 0.2 * (candidate.distance / FOURSQUARE_MATCH_RADIUS_M);
    const confidence = nameSimilarity(ours, candidate.name) * (1 - distancePenalty);
    if (confidence < FOURSQUARE_MATCH_FLOOR) continue;
    const better =
      best === null ||
      confidence > best.confidence ||
      (confidence === best.confidence && candidate.distance < bestDistance);
    if (better) {
      best = { fsqPlaceId: candidate.fsqPlaceId, confidence: Math.round(confidence * 1000) / 1000 };
      bestDistance = candidate.distance;
    }
  }
  return best;
}
