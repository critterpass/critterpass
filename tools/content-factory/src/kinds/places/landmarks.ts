/**
 * A destination's landmarks: the Wikidata items in and just around its area a visitor expects to
 * find, World Heritage sites and the sights (bridges, beaches, mountains, lakes, temples, museums)
 * that Wikipedias in at least seven languages write about, or in two where few reach seven (a
 * highland town such as Đà Lạt). Open data names its places freely, so the
 * place each landmark is comes from the place-photo matcher (media/place-match): near the item,
 * with a name that says the same. The curated set always holds it, under the category the item's
 * type gives (a bridge is not a museum). A landmark beyond the importer's area, such as the Mỹ Sơn
 * sanctuary south of Đà Nẵng, has no place to match and enters as an editorial place made from
 * the item.
 */
import type { PoiCategory } from '@cp/domain';
import type pg from 'pg';

import { getJson, type SourceHttp } from '../media/http';
import { matchPlace, tellingWords, words, type WikidataPoint } from '../media/place-match';
import { HAS_CONTENT_REF } from './pins';

/**
 * Day trips just past the city's edge: Mỹ Sơn lies 9 km beyond Đà Nẵng's box and the Pongour
 * falls 20 km beyond Đà Lạt's; Huế, 28 km out, is a destination of its own.
 */
const DAY_TRIP_MARGIN_KM = 25;
const MIN_SITELINKS = 7;
/** With fewer landmarks than this at seven sitelinks, the destination takes its sights from two. */
const FEW_LANDMARKS = 12;
const MIN_SITELINKS_WHERE_FEW = 2;
/** One in ten of a 400-place set, so landmarks never crowd out a city's food and temples. */
const MAX_LANDMARKS = 40;
/** The widest distance the matcher accepts (beaches and nature). */
const SEARCH_RADIUS_M = 3000;

export interface Landmark extends WikidataPoint {
  readonly name: string;
  readonly nameLocal: string | null;
  readonly sitelinks: number;
  readonly worldHeritage: boolean;
  /** The category the item's type gives, or null when the type says nothing (a tourist attraction). */
  readonly category: PoiCategory | null;
}

export interface Box {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Item classes (and their subclasses) that make a sight, with the category each gives. */
const CLASSES: readonly (readonly [string, PoiCategory | null])[] = [
  ['Q1370598', 'temple_shrine'], // place of worship
  ['Q33506', 'museum'],
  ['Q40080', 'beach'],
  ['Q37654', 'market'],
  ['Q330284', 'market'], // marketplace
  ['Q8502', 'nature'], // mountain
  ['Q46831', 'nature'], // mountain range
  ['Q133056', 'nature'], // mountain pass
  ['Q34763', 'nature'], // peninsula
  ['Q23442', 'nature'], // island
  ['Q35509', 'nature'], // cave
  ['Q22698', 'nature'], // park
  ['Q54050', 'nature'], // hill
  ['Q23397', 'nature'], // lake
  ['Q131681', 'nature'], // reservoir
  ['Q34038', 'nature'], // waterfall
  ['Q39816', 'nature'], // valley
  ['Q55488', null], // railway station
  ['Q12280', 'other'], // bridge
  ['Q676050', 'other'], // old town
  ['Q839954', 'other'], // archaeological site
  ['Q875157', 'other'], // resort
  ['Q570116', null], // tourist attraction
];
/** When an item is several things (Mỹ Sơn: Hindu temple, archaeological site), the first wins. */
const PRECEDENCE: readonly PoiCategory[] = [
  'temple_shrine',
  'museum',
  'beach',
  'market',
  'nature',
  'other',
];

const SPARQL = 'https://query.wikidata.org/sparql';
const KM_PER_DEG = 111.32;

export function widened(box: Box, km = DAY_TRIP_MARGIN_KM): Box {
  const lat = km / KM_PER_DEG;
  const lng = km / (KM_PER_DEG * Math.cos((((box.south + box.north) / 2) * Math.PI) / 180));
  return {
    south: box.south - lat,
    west: box.west - lng,
    north: box.north + lat,
    east: box.east + lng,
  };
}

interface SparqlRow {
  item: { value: string };
  links: { value: string };
  whs: { value: string };
  lat: { value: string };
  lng: { value: string };
  kinds?: { value: string };
  en?: { value: string };
  local?: { value: string };
  labels?: { value: string };
}

/** The landmarks inside `box` (administrative areas left out), most written-about first. */
export async function wikidataLandmarks(
  http: SourceHttp,
  box: Box,
  language: string,
): Promise<Landmark[]> {
  const values = CLASSES.map(([id, category]) => `(wd:${id} "${category ?? 'sight'}")`).join(' ');
  const query = `SELECT ?item ?links ?whs (SAMPLE(?lat0) AS ?lat) (SAMPLE(?lng0) AS ?lng)
  (GROUP_CONCAT(DISTINCT ?kind; separator="|") AS ?kinds) (SAMPLE(?en0) AS ?en) (SAMPLE(?local0) AS ?local)
  (GROUP_CONCAT(DISTINCT ?label; separator="|") AS ?labels) WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:cornerSouthWest "Point(${box.west.toFixed(4)} ${box.south.toFixed(4)})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerNorthEast "Point(${box.east.toFixed(4)} ${box.north.toFixed(4)})"^^geo:wktLiteral . }
  ?item wikibase:sitelinks ?links .
  FILTER NOT EXISTS { ?item wdt:P31/wdt:P279* wd:Q56061 }
  BIND(EXISTS { ?item wdt:P1435 wd:Q9259 } AS ?whs)
  OPTIONAL { VALUES (?class ?kind) { ${values} } ?item wdt:P31/wdt:P279* ?class }
  FILTER(?whs || (?links >= ${String(MIN_SITELINKS_WHERE_FEW)} && BOUND(?kind)))
  OPTIONAL { ?item rdfs:label ?en0 FILTER(LANG(?en0) = "en") }
  OPTIONAL { ?item rdfs:label ?local0 FILTER(LANG(?local0) = "${language}") }
  OPTIONAL { ?item rdfs:label|skos:altLabel ?label FILTER(LANG(?label) IN ("en", "${language}")) }
  BIND(geof:latitude(?loc) AS ?lat0) BIND(geof:longitude(?loc) AS ?lng0)
} GROUP BY ?item ?links ?whs`;
  const url = new URL(SPARQL);
  url.searchParams.set('query', query);
  const body = await getJson<{ results: { bindings: SparqlRow[] } }>(http, url, {
    headers: { accept: 'application/sparql-results+json' },
  });
  const found = body.results.bindings
    .flatMap((row): Landmark[] => {
      const name = row.en?.value ?? row.local?.value;
      if (name === undefined) return [];
      const kinds = (row.kinds?.value ?? '').split('|');
      const local = row.local?.value ?? null;
      return [
        {
          id: row.item.value.slice(row.item.value.lastIndexOf('/') + 1),
          name,
          nameLocal: local === name ? null : local,
          labels: (row.labels?.value ?? '').split('|').filter(Boolean),
          lat: Number(row.lat.value),
          lng: Number(row.lng.value),
          sitelinks: Number(row.links.value),
          worldHeritage: row.whs.value === 'true',
          category: PRECEDENCE.find((category) => kinds.includes(category)) ?? null,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.worldHeritage) - Number(a.worldHeritage) ||
        b.sitelinks - a.sitelinks ||
        a.id.localeCompare(b.id),
    );
  const known = found.filter((l) => l.worldHeritage || l.sitelinks >= MIN_SITELINKS);
  return (known.length >= FEW_LANDMARKS ? known : found).slice(0, MAX_LANDMARKS);
}

export interface LandmarkCandidate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly editorial: boolean;
}

export interface LandmarkPlace {
  readonly landmark: Landmark;
  readonly poiId: string;
  /** The place's whole name, not only a part of it ("Bà Nà" in "Thích Ca Phật Đài - Bà Nà"), names the landmark. */
  readonly wholeName: boolean;
}

/**
 * The place each landmark is among `candidates` (the POIs near it): one its whole name matches
 * before one a part of its name does, then the best match, an already curated place before an
 * imported one, then the nearest.
 */
export function pickLandmarkPlaces(
  landmarks: readonly Landmark[],
  candidates: readonly LandmarkCandidate[],
): LandmarkPlace[] {
  return landmarks.flatMap((landmark) => {
    const ranked = candidates.flatMap((poi) => {
      const whole = matchPlace(poi, [landmark], true);
      const match = whole ?? matchPlace(poi, [landmark]);
      return match === null ? [] : [{ poi, match, whole: whole !== null }];
    });
    ranked.sort(
      (a, b) =>
        Number(b.whole) - Number(a.whole) ||
        b.match.score - a.match.score ||
        Number(b.poi.editorial) - Number(a.poi.editorial) ||
        a.match.distanceM - b.match.distanceM,
    );
    const best = ranked[0];
    return best === undefined ? [] : [{ landmark, poiId: best.poi.id, wholeName: best.whole }];
  });
}

/**
 * A word-boundary regex for the POIs that may be the landmark: a name holding one of the words
 * that set its labels apart, or a whole label ("Chùa Cầu" is all place types). Null when neither.
 */
export function namePattern(landmark: Landmark): string | null {
  const phrases = new Set(landmark.labels.flatMap(tellingWords));
  for (const label of landmark.labels) {
    const folded = words(label).join(' ');
    if (folded !== '') phrases.add(folded);
  }
  // Open data also writes the town as one word.
  for (const phrase of [...phrases]) phrases.add(phrase.replaceAll('da lat', 'dalat'));
  return phrases.size === 0 ? null : `\\m(${[...phrases].join('|')})\\M`;
}

/** The destination's area (its geofence, else the box its places are imported in) as a box. */
export async function destinationBox(pool: pg.Pool, destinationId: string): Promise<Box | null> {
  const { rows } = await pool.query<Box>(
    `SELECT ST_YMin(e) AS south, ST_XMin(e) AS west, ST_YMax(e) AS north, ST_XMax(e) AS east
     FROM (SELECT ST_Envelope(COALESCE(geofence, place_bounds)::geometry) AS e
           FROM destinations WHERE id = $1) box
     WHERE e IS NOT NULL`,
    [destinationId],
  );
  return rows[0] ?? null;
}

/**
 * Matches each landmark to a POI of the destination a release can name (./pins); `outside` are
 * the landmarks with no POI that lie beyond the destination's area, where the importer brings
 * nothing in.
 */
export async function landmarkPlaces(
  pool: pg.Pool,
  destinationId: string,
  landmarks: readonly Landmark[],
): Promise<{ matched: LandmarkPlace[]; outside: Landmark[] }> {
  const searched = landmarks.flatMap((landmark) => {
    const pattern = namePattern(landmark);
    return pattern === null ? [] : [{ landmark, pattern }];
  });
  const { rows } = await pool.query<LandmarkCandidate & { n: number }>(
    `SELECT l.n::int AS n, p.id, p.name, p.category, p.lat, p.lng, p.curation = 'editorial' AS editorial
     FROM unnest($2::float8[], $3::float8[], $4::text[]) WITH ORDINALITY AS l(lat, lng, pattern, n)
     JOIN pois p ON p.destination_id = $1 AND p.status = 'active' AND p.merged_into_id IS NULL
       AND ${HAS_CONTENT_REF}
       AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography, $5)
       AND app.unaccent_immutable(lower(p.name)) ~ l.pattern`,
    [
      destinationId,
      searched.map((s) => s.landmark.lat),
      searched.map((s) => s.landmark.lng),
      searched.map((s) => s.pattern),
      SEARCH_RADIUS_M,
    ],
  );
  const matched = searched.flatMap(({ landmark }, index) =>
    pickLandmarkPlaces(
      [landmark],
      rows.filter((row) => row.n === index + 1),
    ),
  );
  const found = new Set(matched.map((m) => m.landmark.id));
  const unmatched = landmarks.filter((landmark) => !found.has(landmark.id));
  const covered = await pool.query<{ covered: boolean }>(
    `SELECT COALESCE(ST_Covers(COALESCE(d.geofence, d.place_bounds), ST_SetSRID(ST_MakePoint(l.lng, l.lat), 4326)::geography), true) AS covered
     FROM unnest($2::float8[], $3::float8[]) WITH ORDINALITY AS l(lat, lng, n)
     CROSS JOIN destinations d WHERE d.id = $1 ORDER BY l.n`,
    [destinationId, unmatched.map((l) => l.lat), unmatched.map((l) => l.lng)],
  );
  const outside = unmatched.filter((_, index) => covered.rows[index]?.covered === false);
  return { matched, outside };
}

/** The landmarks of a destination with an area, matched to its POIs (none without one). */
export async function destinationLandmarks(
  pool: pg.Pool,
  destinationId: string,
  language: string,
  http: SourceHttp,
): Promise<{ landmarks: Landmark[]; matched: LandmarkPlace[]; outside: Landmark[] }> {
  const box = await destinationBox(pool, destinationId);
  if (box === null) return { landmarks: [], matched: [], outside: [] };
  const landmarks = await wikidataLandmarks(http, widened(box), language);
  return { landmarks, ...(await landmarkPlaces(pool, destinationId, landmarks)) };
}
