/**
 * OpenStreetMap tags onto the POI taxonomy (`./categories.ts`). OSM is read for the travel variety
 * Overture lacks (viewpoints, peaks, waterfalls, beaches, temples, ruins, parks, markets) and for
 * opening hours, which neither Overture nor FSQ OS carries. So a tagged object is one of two kinds:
 *
 * - a `place`: a sight worth its own POI; ingest adds it when no other source already has it;
 * - `hours_only`: a business Overture and FSQ OS already cover well (food, bars, shops, stays);
 *   ingest only uses it to fill the hours, website or phone of the POI it matches, never adds it,
 *   so OSM's copy of a restaurant can never duplicate the open-data one.
 */
import type { PoiCategory } from './categories';

export type OsmTags = Readonly<Record<string, string>>;

export interface OsmClassification {
  readonly category: PoiCategory;
  readonly kind: 'place' | 'hours_only';
}

/** Keys an element must carry one of to be read at all; the ingest query filters on these. */
export const OSM_POI_KEYS = [
  'tourism',
  'historic',
  'natural',
  'leisure',
  'amenity',
  'shop',
  'waterway',
  'boundary',
] as const;

type ValueTable = Readonly<Record<string, PoiCategory>>;

const PLACE_TAGS: Readonly<Record<string, ValueTable>> = {
  tourism: {
    attraction: 'other',
    viewpoint: 'nature',
    museum: 'museum',
    gallery: 'museum',
    zoo: 'museum',
    aquarium: 'museum',
    theme_park: 'other',
    picnic_site: 'nature',
  },
  historic: {
    archaeological_site: 'museum',
    castle: 'museum',
    city_gate: 'museum',
    fort: 'museum',
    heritage: 'museum',
    manor: 'museum',
    monument: 'museum',
    palace: 'museum',
    ruins: 'museum',
    tomb: 'museum',
    building: 'museum',
    church: 'temple_shrine',
    monastery: 'temple_shrine',
    temple: 'temple_shrine',
    shrine: 'temple_shrine',
  },
  natural: {
    peak: 'nature',
    volcano: 'nature',
    waterfall: 'nature',
    cave_entrance: 'nature',
    spring: 'nature',
    hot_spring: 'nature',
    geyser: 'nature',
    arch: 'nature',
    cape: 'nature',
    beach: 'beach',
  },
  waterway: { waterfall: 'nature' },
  leisure: {
    park: 'nature',
    garden: 'nature',
    nature_reserve: 'nature',
    beach_resort: 'beach',
    water_park: 'other',
  },
  boundary: { national_park: 'nature' },
  amenity: { place_of_worship: 'temple_shrine', marketplace: 'market' },
};

const HOURS_ONLY_TAGS: Readonly<Record<string, ValueTable>> = {
  amenity: {
    restaurant: 'food',
    cafe: 'food',
    fast_food: 'food',
    food_court: 'food',
    ice_cream: 'food',
    bar: 'nightlife',
    pub: 'nightlife',
    nightclub: 'nightlife',
    biergarten: 'nightlife',
    pharmacy: 'health',
    clinic: 'health',
    hospital: 'health',
  },
  tourism: { hotel: 'stay', guest_house: 'stay', hostel: 'stay', motel: 'stay' },
};

/** Private or closed-off objects (a residential garden, a private chapel) are never travel POIs. */
const CLOSED_ACCESS = new Set(['private', 'no']);

function lookup(
  tables: Readonly<Record<string, ValueTable>>,
  tags: OsmTags,
): PoiCategory | undefined {
  for (const [key, values] of Object.entries(tables)) {
    const value = tags[key];
    if (value !== undefined && values[value] !== undefined) return values[value];
  }
  return undefined;
}

/**
 * Classifies one OSM element by its tags; null when it is not something we read (unnamed, private,
 * or a tag outside both tables). Sight tags win over business tags, so a temple that also sells
 * snacks stays a temple.
 */
export function classifyOsmTags(tags: OsmTags): OsmClassification | null {
  if ((tags['name'] ?? '').trim().length === 0) return null;
  if (CLOSED_ACCESS.has(tags['access'] ?? '')) return null;
  const place = lookup(PLACE_TAGS, tags);
  if (place !== undefined) return { category: place, kind: 'place' };
  const business = lookup(HOURS_ONLY_TAGS, tags);
  if (business !== undefined) return { category: business, kind: 'hours_only' };
  if (tags['shop'] !== undefined) {
    return { category: tags['shop'] === 'marketplace' ? 'market' : 'shopping', kind: 'hours_only' };
  }
  return null;
}
