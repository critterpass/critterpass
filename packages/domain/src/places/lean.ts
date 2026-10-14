/**
 * The lean place index (docs/product-decisions.md D38, docs/data-model.md §3.13): which open-data
 * places we keep. Ingest writes only rows that pass, and the operator prune deletes stored rows
 * that fail (unless something references them or they are editorial).
 *
 * - Kinds: travel kinds only. `transit` counts only for hubs (airports, train and bus stations,
 *   ferry terminals), told by the source's own label; shopping, health and other are left out.
 * - OpenStreetMap sights are travel places by construction (the reader takes them from
 *   `tourism`, `historic`, `natural` and similar tags), so an OSM sight passes in any kind,
 *   `other` included (attractions and theme parks), and has no confidence floor.
 * - Overture rows need an existence confidence of at least `LEAN_CONFIDENCE_FLOOR`; it is the
 *   only quality signal Overture gives. Measured on staging (14 Oct): 61 % of Đà Lạt's and 57 %
 *   of Đà Nẵng's Overture-only rows are at or above it.
 */
import type { PoiCategory } from './categories';

/** Kinds a place may have and stay in the index; `transit` also needs a hub label. */
export const LEAN_KINDS: readonly PoiCategory[] = [
  'temple_shrine',
  'food',
  'market',
  'nature',
  'beach',
  'museum',
  'nightlife',
  'stay',
];

export const LEAN_CONFIDENCE_FLOOR = 0.6;

/**
 * Source labels of a transit hub: Overture's taxonomy slugs, and OpenStreetMap `key=value` tags.
 * Bus stops, parking, taxi ranks, gates and check-in counters are not hubs.
 */
export const TRANSIT_HUB_LABELS: ReadonlySet<string> = new Set([
  'airport',
  'airport_terminal',
  'train_station',
  'railway_station',
  'bus_station',
  'ferry_terminal',
  'ferry_service',
  'aeroway=aerodrome',
  'railway=station',
  'amenity=bus_station',
  'amenity=ferry_terminal',
]);

/**
 * Stored rows keep no source label, so the prune tells a transit hub by its name instead (any
 * language the index holds much of). A hub this misses comes back on the destination's next
 * ingest, which reads the label.
 */
export const TRANSIT_HUB_NAME_PATTERN =
  '(airport|aeropuerto|aeroporto|aéroport|flughafen|sân bay|空港|机场|機場|공항|ท่าอากาศยาน|' +
  'station|estación|estação|gare|bahnhof|stazione|nhà ga|^ga |駅|火车站|車站|역|สถานี|' +
  'bus terminal|bến xe|terminal rodoviário|terminal de autobuses|' +
  'ferry|bến phà|bến tàu|cảng|pier|jetty|harbou?r|muelle)';

export function isTransitHub(labels: readonly string[]): boolean {
  return labels.some((label) => TRANSIT_HUB_LABELS.has(label.trim().toLowerCase()));
}

export interface LeanCandidate {
  readonly category: PoiCategory;
  /** The source's own category labels, most specific first. */
  readonly labels: readonly string[];
  readonly source: 'overture' | 'osm';
  /** Overture's existence score in [0, 1]. */
  readonly confidence?: number | undefined;
}

/** Whether an open-data place belongs in the lean index (see file header). */
export function isLeanPlace(place: LeanCandidate): boolean {
  if (place.source === 'osm') {
    return place.category !== 'transit' || isTransitHub(place.labels);
  }
  const kind =
    LEAN_KINDS.includes(place.category) ||
    (place.category === 'transit' && isTransitHub(place.labels));
  return kind && place.confidence !== undefined && place.confidence >= LEAN_CONFIDENCE_FLOOR;
}
