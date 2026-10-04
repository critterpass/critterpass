/**
 * The destinations with a region pack: the guide destinations (product-decisions.md §6) and the
 * guest places built so far, each with a real Geofabrik regional extract
 * to build a full-detail PMTiles region pack from and a bounding box tight enough to keep
 * planetiler's output inside the ≤80 MB per-destination budget (still an open question). Slugs
 * match the real `destinations.slug` rows already seeded on staging (verified via
 * `railway run --service api --environment staging`, not assumed).
 *
 * The other 55 (of 61) places are guest-guide, city-bbox packs built from the same pipeline
 * (`build-pmtiles.ts --destination <slug> --bounds <minLon,minLat,maxLon,maxLat> --geofabrik-region
 * <region>`). A guest place gets an entry here once its pack is built, so the box it was built
 * from is on record; start from its `destinations.place_bounds` and widen it to the day trips
 * (`missing-regions.ts` lists the places that still need one).
 */
export interface DestinationExtract {
  /** Must match a real `destinations.slug` row. */
  readonly slug: string;
  /** Geofabrik region path relative to https://download.geofabrik.de/, no `.osm.pbf` suffix. */
  readonly geofabrikRegion: string;
  /** `minLon,minLat,maxLon,maxLat` passed to planetiler's `--bounds`. */
  readonly bounds: string;
}

export const GUIDE_DESTINATION_EXTRACTS: readonly DestinationExtract[] = [
  {
    slug: 'bali',
    // Indonesia has no Bali-specific Geofabrik extract; Bali is part of the Nusa Tenggara
    // (Lesser Sunda Islands) regional extract (176 MB, verified via a real HEAD request).
    geofabrikRegion: 'asia/indonesia/nusa-tenggara',
    bounds: '114.40,-8.90,115.75,-8.05',
  },
  {
    slug: 'kyoto',
    // Whole-Japan (2.5 GB) is too large for this machine's disk budget; Kansai (352 MB) covers it.
    geofabrikRegion: 'asia/japan/kansai',
    bounds: '135.60,34.85,135.90,35.15',
  },
  {
    slug: 'iceland',
    // Whole country is only 65 MB, so no sub-extract is needed; bbox still keeps output tight
    // around the capital region + golden-circle touring loop rather than the whole island.
    geofabrikRegion: 'europe/iceland',
    bounds: '-22.35,63.70,-19.50,64.85',
  },
  {
    slug: 'mexico-city',
    geofabrikRegion: 'north-america/mexico',
    bounds: '-99.35,19.10,-98.85,19.60',
  },
  {
    slug: 'lisbon',
    geofabrikRegion: 'europe/portugal',
    bounds: '-9.55,38.60,-9.00,38.85',
  },
  {
    slug: 'cusco',
    geofabrikRegion: 'south-america/peru',
    bounds: '-72.30,-13.70,-71.70,-13.20',
  },
  {
    slug: 'da-nang',
    // Same box as the destination's geofence and POI ingest: Hải Vân pass and Sơn Trà to Hội An,
    // Bà Nà hills in the west.
    geofabrikRegion: 'asia/vietnam',
    bounds: '107.95,15.84,108.36,16.21',
  },
  {
    slug: 'vn-da-lat',
    // Wider than the town's place box, which stops short of the day trips: Lang Biang in the
    // north, Liên Khương airport, Elephant and Pongour falls in the south-west.
    geofabrikRegion: 'asia/vietnam',
    bounds: '108.25,11.65,108.62,12.12',
  },
  {
    slug: 'vn-hoi-an',
    // The old town and its beaches, Mỹ Sơn in the west and Cù Lao Chàm offshore.
    geofabrikRegion: 'asia/vietnam',
    bounds: '108.10,15.72,108.56,16.00',
  },
];

export function resolveGuideDestination(slug: string): DestinationExtract {
  const destination = GUIDE_DESTINATION_EXTRACTS.find((entry) => entry.slug === slug);
  if (!destination) {
    const known = GUIDE_DESTINATION_EXTRACTS.map((entry) => entry.slug).join(', ');
    throw new Error(`tiles: unknown guide destination slug "${slug}"; known: ${known}`);
  }
  return destination;
}
