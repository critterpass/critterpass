/**
 * Which Nominatim result (`@cp/suppliers` asks) is a place we were asked for. A result is the place only
 * when one of its names (its namedetails variants) passes the curated name rules of
 * `@cp/planner` and, when a radius is given, it lies within it of the lead's point. The text-alike
 * rule (for scripts written without spaces) holds only for a sight within `SIMILAR_RADIUS_M`: a
 * business must share the place's words ("Patong Beach Hotel" is not Patong Beach). The accepted
 * place takes OpenStreetMap's name, local name, point, address parts and, through the ingest's
 * OSM mapping, its category (the lead's when OSM's tags are not a kind we map).
 */
import {
  classifyOsmTags,
  type NominatimQuery,
  type NominatimResult,
  type OsmTags,
  type PoiCategory,
} from '@cp/domain';

import {
  chooseCuratedMatch,
  SIMILAR_RADIUS_M,
  trigramSimilarity,
  type CuratedLead,
  type MatchCandidate,
} from './curated-name-rules';
import { metresBetween } from './same-place';

/** A place OpenStreetMap carries, as a `pois` row takes it. */
export interface OsmPlace {
  /** `n<id>`, `w<id>` or `r<id>`: the `source_ids.osm` key, as the ingest writes it. */
  readonly sourceId: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly openingHours: string | null;
  readonly website: string | null;
  readonly phone: string | null;
  /** From the lead's point. */
  readonly distanceM: number;
}

const OSM_PREFIX: Readonly<Record<string, string>> = { node: 'n', way: 'w', relation: 'r' };

/** Name keys that hold the place's own name (old and historic names are left out). */
const NAME_KEY =
  /^(name|name:[a-z]{2,3}(-[A-Za-z]+)?|alt_name|official_name|int_name|short_name)$/u;

const clean = (value: string | null | undefined): string | null => {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
};

const distanceM = metresBetween;

/** Every name a result goes by: its namedetails variants and its display name. */
export function resultNames(result: NominatimResult): string[] {
  const names = Object.entries(result.namedetails ?? {})
    .filter(([key]) => NAME_KEY.test(key))
    .flatMap(([, value]) => value.split(';'));
  return [...new Set([...names, result.name ?? ''].map(clean).filter((n) => n !== null))];
}

/** The address the result's parts make: house number and street, area, then town. */
export function addressFromParts(
  parts: Readonly<Record<string, string>> | null | undefined,
): string | null {
  if (parts === null || parts === undefined) return null;
  const street = parts['road'] ?? parts['pedestrian'] ?? parts['footway'] ?? parts['square'];
  const line = street === undefined ? null : clean([parts['house_number'], street].join(' '));
  const area = parts['suburb'] ?? parts['quarter'] ?? parts['neighbourhood'] ?? parts['village'];
  const town =
    parts['city'] ?? parts['town'] ?? parts['municipality'] ?? parts['county'] ?? parts['state'];
  const lines = [line, clean(area), clean(town)].filter((part) => part !== null);
  const unique = lines.filter((part, index) => lines.indexOf(part) === index);
  return unique.length === 0 ? null : unique.join(', ');
}

/**
 * The OSM place a result is, when it is the lead (see the file header); `radiusM` null skips the
 * distance check (the search box already bounds the result).
 */
export function acceptResult(
  lead: CuratedLead,
  result: NominatimResult,
  plain: ReadonlySet<string>,
  radiusM: number | null,
): { readonly place: OsmPlace; readonly score: number } | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  const prefix = OSM_PREFIX[result.osm_type];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || prefix === undefined) return null;
  const away = distanceM(lead, { lat, lng });
  if (radiusM !== null && away > radiusM) return null;
  const details = result.namedetails ?? {};
  const own = clean(details['name']) ?? clean(result.name);
  if (own === null) return null;
  const tags: OsmTags = { ...result.extratags, name: own, [result.category]: result.type };
  const classified = classifyOsmTags(tags);
  const sourceId = `${prefix}${String(result.osm_id)}`;
  const alike = away <= SIMILAR_RADIUS_M && classified?.kind !== 'hours_only';
  // Each name is weighed on its own, as if at the point: the distance is checked above.
  const candidates: MatchCandidate[] = resultNames(result).map((name, index) => ({
    id: `${sourceId}:${index}`,
    name,
    nameLocal: null,
    category: classified?.category ?? 'other',
    lat,
    lng,
    address: null,
    quality: 0,
    distanceM: 0,
    similarity: alike
      ? Math.max(
          trigramSimilarity(name, lead.name),
          lead.localName === null ? 0 : trigramSimilarity(name, lead.localName),
        )
      : 0,
  }));
  const verdict = chooseCuratedMatch(lead, candidates, plain);
  if (verdict.kind === 'none') return null;
  const english = clean(details['name:en']);
  const extra = result.extratags ?? {};
  return {
    score: verdict.score,
    place: {
      sourceId,
      name: english ?? own,
      nameLocal: english !== null && english !== own ? own : null,
      category: classified?.category ?? lead.category,
      lat,
      lng,
      address: addressFromParts(result.address),
      openingHours: clean(extra['opening_hours']),
      website: clean(extra['website'] ?? extra['contact:website']),
      phone: clean(extra['phone'] ?? extra['contact:phone']),
      distanceM: away,
    },
  };
}

export interface OsmLookup {
  readonly place: OsmPlace | null;
  readonly queries: number;
  /** The nearest result of a query that was not the place, for a report. */
  readonly nearestRejected: { readonly name: string; readonly distanceM: number } | null;
}

/**
 * Asks each query in turn and stops at the first answer with an accepted result (the best name,
 * then the nearest). `search` may answer null when it may not ask now (a rate limit): the lookup
 * stops there with no place.
 */
export async function findOsmPlace(
  lead: CuratedLead,
  queries: readonly NominatimQuery[],
  plain: ReadonlySet<string>,
  radiusM: number | null,
  search: (query: NominatimQuery) => Promise<readonly NominatimResult[] | null>,
): Promise<OsmLookup> {
  let asked = 0;
  let nearestRejected: OsmLookup['nearestRejected'] = null;
  for (const query of queries) {
    const results = await search(query);
    if (results === null) break;
    asked += 1;
    const accepted = results
      .map((result) => acceptResult(lead, result, plain, radiusM))
      .filter((found) => found !== null)
      .sort((a, b) => b.score - a.score || a.place.distanceM - b.place.distanceM);
    const best = accepted[0];
    if (best !== undefined) return { place: best.place, queries: asked, nearestRejected };
    for (const result of results) {
      const away = Math.round(
        distanceM(lead, { lat: Number(result.lat), lng: Number(result.lon) }),
      );
      if (nearestRejected === null || away < nearestRejected.distanceM) {
        nearestRejected = { name: result.name ?? '', distanceM: away };
      }
    }
  }
  return { place: null, queries: asked, nearestRejected };
}
