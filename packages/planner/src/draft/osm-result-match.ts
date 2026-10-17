/**
 * Which Nominatim result (`@cp/suppliers` asks) is a place we were asked for. A result is the
 * place only when one of its names (its namedetails variants) passes the curated name rules and,
 * when a radius is given, it lies within it of the lead's point, or carries the place's own full
 * name within `FAR_NAME_RADIUS_M` while no result of that name stands elsewhere. The text-alike
 * rule (for scripts written without spaces) holds only for a sight within `SIMILAR_RADIUS_M`: a
 * business must share the place's words ("Patong Beach Hotel" is not Patong Beach). The accepted
 * place takes OpenStreetMap's name, local name, point, address parts and, through the ingest's
 * OSM mapping, its category (the lead's when OSM's tags are not a kind we map).
 *
 * A stop or platform named after a place is never the place. A street, quay, square or district
 * (`namesAnArea`) is one of OSM's streets, squares, quarters and districts: a named road or
 * pedestrian way, a `place` or an administrative area, a shopping or commercial area, a street
 * market, a waterfront park, or a business of its own kind under its exact name (a shopping
 * street's mall); never a station or a sight named after it ("Clarke Quay" the MRT station). A
 * road or district itself may carry a word more ("Calle Apolinar Jaen": `mapsArea`).
 *
 * Open data and researchers name what stands on a street after the street, so for a researched
 * place a road or path (`STREETS`) or a district (`DISTRICTS`) is the place only when the place
 * may be one (`streetScope`: a street or area, a trail, bridge or pass, a village, town or
 * island; never a bar, an izakaya, a river or a temple, whatever its kind words say). A trail,
 * village or island by its kind alone ("coastal path") must also carry its English name in one
 * of the result's names, or hold one of them, spaces, hyphens and accents aside: its local name
 * alone does not make it that street. A typed search (no researched kind) takes what it names.
 */
import {
  classifyOsmTags,
  type NominatimQuery,
  type NominatimResult,
  type OsmTags,
  type PoiCategory,
} from '@cp/domain';

import { FAR_NAME_RADIUS_M, farNamed } from './curated-full-names';
import {
  chooseCuratedMatch,
  sharedFullName,
  SIMILAR_RADIUS_M,
  trigramSimilarity,
  type CuratedLead,
  type MatchCandidate,
} from './curated-name-rules';
import { namesAnArea, streetScope } from './curated-kind-rules';
import { nameTokens } from './place-names';
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

/** Stops and platforms: they take the name of what they serve. */
const STOPS: Readonly<Record<string, RegExp>> = {
  highway: /^(?:bus_stop|platform)$/u,
  railway: /^(?:platform|stop|halt|tram_stop|subway_entrance)$/u,
  public_transport: /./u,
  amenity: /^(?:bus_station|taxi)$/u,
};

/** OSM objects a street, quay, square or district is mapped as (Nominatim's class and type). */
const AREAS: Readonly<Record<string, RegExp>> = {
  highway:
    /^(?:pedestrian|footway|living_street|residential|unclassified|tertiary|secondary|primary|service|road)$/u,
  place: /^(?:quarter|neighbourhood|suburb|square|locality|city_block|plot)$/u,
  boundary: /^administrative$/u,
  landuse: /^(?:retail|commercial)$/u,
  tourism: /^attraction$/u,
  amenity: /^marketplace$/u,
  leisure: /^park$/u,
};

const isStop = (result: NominatimResult) => STOPS[result.category]?.test(result.type) ?? false;
const isArea = (result: NominatimResult) => AREAS[result.category]?.test(result.type) ?? false;

/** OSM's roads and paths (stops and platforms are weighed above). */
const STREETS: Readonly<Record<string, RegExp>> = { highway: /./u };
/** OSM's districts and neighbourhoods. */
const DISTRICTS: Readonly<Record<string, RegExp>> = {
  place: /^(?:quarter|neighbourhood|suburb|city_block|plot)$/u,
  boundary: /^administrative$/u,
  landuse: /^(?:retail|commercial|residential)$/u,
};

const tagged = (classes: Readonly<Record<string, RegExp>>, result: NominatimResult) =>
  classes[result.category]?.test(result.type) ?? false;

/** A name in Latin letters without spaces, hyphens, accents or case ("hanamikoji"). */
const squashed = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Whether the English name (or a part of a compound one: "DUMBO and Brooklyn Bridge Park") and one
 * of the result's names hold one another, written squashed (see the file header).
 */
export function carriesEnglishName(english: string, names: readonly string[]): boolean {
  const bare = english.replace(/\s*\([^)]*\)\s*/gu, ' ');
  const ours = [bare, ...bare.split(/\s+(?:and|&|\/)\s+/iu)]
    .map(squashed)
    .filter((n) => n.length >= 4);
  const theirs = names.map(squashed).filter((name) => name.length >= 4);
  return ours.some((a) => theirs.some((b) => a.includes(b) || b.includes(a)));
}

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
): { readonly place: OsmPlace; readonly score: number; readonly far: boolean } | null {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  const prefix = OSM_PREFIX[result.osm_type];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || prefix === undefined) return null;
  const away = distanceM(lead, { lat, lng });
  // Beyond the radius only the place's own full name will do (`farNamed`).
  const beyond = radiusM !== null && away > radiusM;
  if (beyond && away > Math.max(radiusM, FAR_NAME_RADIUS_M)) return null;
  const details = result.namedetails ?? {};
  const own = clean(details['name']) ?? clean(result.name);
  if (own === null) return null;
  const tags: OsmTags = { ...result.extratags, name: own, [result.category]: result.type };
  const classified = classifyOsmTags(tags);
  if (lead.category !== 'transit' && isStop(result)) return null;
  // A typed search (no researched kind) asks for what it names, a street included.
  const researched = lead.subtype !== undefined;
  const street = researched && tagged(STREETS, result);
  const district = researched && tagged(DISTRICTS, result);
  const scope = streetScope(lead);
  if (street ? !scope.way : district && !scope.district) return null;
  // A business is weighed by the kind rules below; anything else must be an area to be one.
  if (namesAnArea(lead) && classified?.kind !== 'hours_only' && !isArea(result)) return null;
  const sourceId = `${prefix}${String(result.osm_id)}`;
  const alike = away <= SIMILAR_RADIUS_M && classified?.kind !== 'hours_only';
  // Each name is weighed on its own, as if at the point: the distance is checked above.
  const names = resultNames(result);
  const candidates = (asked: CuratedLead): MatchCandidate[] =>
    names.map((name, index) => ({
      ...(street || district ? { mapsArea: true } : {}),
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
            trigramSimilarity(name, asked.name),
            asked.localName === null ? 0 : trigramSimilarity(name, asked.localName),
          )
        : 0,
    }));
  const verdict = chooseCuratedMatch(lead, candidates(lead), plain);
  if (verdict.kind === 'none') return null;
  const words = new Set(nameTokens(`${lead.name} ${lead.localName ?? ''}`));
  const fullName = (row: MatchCandidate) => sharedFullName(lead, row, plain, words, true) >= 2;
  if (beyond && !candidates(lead).some(fullName)) return null;
  // A trail, village or island by its kind alone is a street or district only by its English name.
  const byEnglish = { ...lead, localName: null };
  if (
    (street || district) &&
    !scope.named &&
    !namesAnArea(lead) &&
    !carriesEnglishName(lead.name, names) &&
    chooseCuratedMatch(byEnglish, candidates(byEnglish), plain).kind === 'none'
  ) {
    return null;
  }
  const english = clean(details['name:en']);
  const extra = result.extratags ?? {};
  return {
    score: verdict.score,
    far: beyond,
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
    const near = accepted.find((found) => !found.far);
    // From afar only when every result of the name stands in one place (`farNamed`).
    const named = results.map((r) => acceptResult(lead, r, plain, null)?.place ?? null);
    const alone =
      farNamed(
        named.filter((place) => place !== null),
        () => 2,
      ).length > 0;
    const best = near ?? (alone ? accepted[0] : undefined);
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
