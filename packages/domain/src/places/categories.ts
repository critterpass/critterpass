/**
 * The fixed POI category taxonomy (docs/data-model.md §3.13): every curated or auto-conflated POI
 * is normalised to one of these twelve buckets regardless of
 * which source (FSQ OS Places, Overture) it came from, so pins, filters and the guide's grounding
 * all reason about the same small vocabulary. `pois.category` (docs/data-model.md §1 "Enums"
 * convention) is a `CHECK` constraint generated from `POI_CATEGORIES` below.
 */
import { z } from 'zod';

export const POI_CATEGORIES = [
  'temple_shrine',
  'food',
  'market',
  'nature',
  'beach',
  'museum',
  'nightlife',
  'shopping',
  'transit',
  'stay',
  'health',
  'other',
] as const;

export const poiCategorySchema = z.enum(POI_CATEGORIES);
export type PoiCategory = (typeof POI_CATEGORIES)[number];

/**
 * Sprite/icon identifiers for map pins. The actual artwork (a doodle sprite sheet, or a guide
 * sprite slotting in beside a pin) is built separately — this table only fixes the stable key each
 * category maps to so the pin component and the sprite sheet can be built independently against the
 * same vocabulary.
 */
export const CATEGORY_ICON_KEYS: Readonly<Record<PoiCategory, string>> = {
  temple_shrine: 'pin-temple-shrine',
  food: 'pin-food',
  market: 'pin-market',
  nature: 'pin-nature',
  beach: 'pin-beach',
  museum: 'pin-museum',
  nightlife: 'pin-nightlife',
  shopping: 'pin-shopping',
  transit: 'pin-transit',
  stay: 'pin-stay',
  health: 'pin-health',
  other: 'pin-other',
};

/**
 * Default `visit_radius_m` by category, used when editorial has not set one explicitly: a rough
 * real-world footprint per venue type, generous enough for a phone's GPS error
 * budget without spilling into a neighbouring POI in a dense old town. Editorial overrides always win
 * (docs: "edited in ops console via `upsert_poi`"); this is only the ingest-time seed.
 */
export const DEFAULT_VISIT_RADIUS_M: Readonly<Record<PoiCategory, number>> = {
  temple_shrine: 60,
  food: 25,
  market: 80,
  nature: 150,
  beach: 200,
  museum: 50,
  nightlife: 30,
  shopping: 50,
  transit: 100,
  stay: 40,
  health: 30,
  other: 40,
};

export function defaultVisitRadiusM(category: PoiCategory): number {
  return DEFAULT_VISIT_RADIUS_M[category];
}

/**
 * Keyword buckets used to map a free-text source category label (FSQ OS Places' human-readable
 * `fsq_category_labels`, e.g. "Dining and Drinking > Restaurant", or an Overture taxonomy slug, e.g.
 * `fast_food_restaurant`) onto our fixed taxonomy. Neither source publishes a stable numeric-id →
 * taxonomy table we can hard-code without it silently drifting out of date at the next FSQ/Overture
 * release (both projects revise their category trees regularly); matching on normalised keywords
 * instead is resilient to that churn and works identically for both sources' label conventions.
 *
 * Order matters: the first bucket whose keyword appears in the normalised label wins, so more
 * distinctive/unambiguous words are listed first (a "bus station" must not fall through to "stay"
 * because it happens to contain no other match, and a "temple garden" must resolve to temple_shrine
 * before the generic "garden" keyword in `nature` gets a chance).
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [PoiCategory, readonly string[]]> = [
  [
    'transit',
    [
      'airport',
      'train station',
      'railway station',
      'subway',
      'metro station',
      'bus station',
      'bus stop',
      'ferry',
      'tram stop',
      'transit station',
      'port terminal',
    ],
  ],
  [
    'health',
    [
      'hospital',
      'clinic',
      'pharmacy',
      'urgent care',
      'dentist',
      'medical center',
      'medical centre',
    ],
  ],
  [
    'stay',
    [
      'hotel',
      'hostel',
      'guesthouse',
      'guest house',
      'resort',
      'ryokan',
      'bed and breakfast',
      'homestay',
      'inn',
    ],
  ],
  [
    'museum',
    [
      'museum',
      'art gallery',
      'heritage site',
      'historic site',
      'historical landmark',
      'monument',
      'castle',
      'palace',
      'ruins',
      'planetarium',
      'aquarium',
      'zoo',
    ],
  ],
  [
    'temple_shrine',
    [
      'temple',
      'shrine',
      'pagoda',
      'monastery',
      'church',
      'cathedral',
      'mosque',
      'synagogue',
      'chapel',
      'place of worship',
      'religious site',
    ],
  ],
  ['beach', ['beach', 'seaside', 'cove', 'lagoon']],
  [
    'nature',
    [
      'park',
      'garden',
      'forest',
      'mountain',
      'volcano',
      'waterfall',
      'lake',
      'river',
      'trail',
      'hiking',
      'nature reserve',
      'national park',
      'botanical',
      'viewpoint',
      'scenic overlook',
    ],
  ],
  ['market', ['market', 'bazaar', 'souk', 'night market', 'flea market', 'farmers market']],
  [
    'nightlife',
    [
      'bar',
      'pub',
      'night club',
      'nightclub',
      'cocktail',
      'speakeasy',
      'karaoke',
      'lounge',
      'brewery',
      'beer garden',
      'live music venue',
    ],
  ],
  [
    'shopping',
    [
      'mall',
      'shopping center',
      'shopping centre',
      'boutique',
      'souvenir',
      'department store',
      'supermarket',
      'grocery',
      'convenience store',
      'bookstore',
      'craft store',
    ],
  ],
  [
    'food',
    [
      'restaurant',
      'cafe',
      'café',
      'coffee',
      'bakery',
      'diner',
      'eatery',
      'noodle',
      'ramen',
      'sushi',
      'food court',
      'dessert',
      'ice cream',
      'bubble tea',
      'tea house',
      'izakaya',
      'bistro',
      'food truck',
      'street food',
      'dining',
    ],
  ],
];

function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/[>/|]/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Maps one free-text source category label (FSQ `fsq_category_labels` entry or an Overture
 * `taxonomy.primary`/`basic_category` slug) to our taxonomy. Never throws: an unrecognised label
 * (a source's long tail, or a genuinely uncategorised place) maps to `'other'` rather than blocking
 * ingest — conflation would rather keep a real POI under a broad bucket than drop it.
 */
export function mapSourceCategoryToTaxonomy(label: string): PoiCategory {
  const normalised = normaliseLabel(label);
  if (normalised.length === 0) return 'other';
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => normalised.includes(keyword))) return category;
  }
  return 'other';
}

/**
 * Picks one taxonomy category from every label a source gave a POI (FSQ can list several,
 * most-specific first; Overture gives one `taxonomy.primary` plus alternates): the first label that
 * maps to anything other than `'other'` wins, so a place's primary label decides unless it is itself
 * unrecognised, in which case a more specific alternate label still gets a chance.
 */
export function mapSourceCategoriesToTaxonomy(labels: readonly string[]): PoiCategory {
  for (const label of labels) {
    const mapped = mapSourceCategoryToTaxonomy(label);
    if (mapped !== 'other') return mapped;
  }
  return 'other';
}
