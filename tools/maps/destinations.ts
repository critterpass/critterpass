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
 * <region>`). A guest place gets an entry in `GUEST_PLACE_EXTRACTS` once its pack is built, so the
 * box it was built from is on record; start from its `destinations.place_bounds` and widen it to the day trips
 * (`missing-regions.ts` lists the places that still need one). Packs the scheduled `map regions`
 * run builds by itself take the box the api gives it (the place's box widened by 30 km) and are
 * not listed here.
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
    // around the capital region + golden-circle touring loop rather than the whole island. The
    // west edge takes in the Reykjanes peninsula: Keflavík airport, where visitors land, and the
    // Blue Lagoon.
    geofabrikRegion: 'europe/iceland',
    bounds: '-22.80,63.70,-19.50,64.85',
  },
  {
    slug: 'mexico-city',
    // North and east of the city to Teotihuacán, the Acolman monastery on the road to it and
    // Felipe Ángeles airport.
    geofabrikRegion: 'north-america/mexico',
    bounds: '-99.35,19.10,-98.78,19.80',
  },
  {
    slug: 'lisbon',
    // Sintra and Cascais in the west; north to the palace of Mafra and Ericeira.
    geofabrikRegion: 'europe/portugal',
    bounds: '-9.55,38.60,-9.00,38.98',
  },
  {
    slug: 'cusco',
    // The Sacred Valley in the north-west; east down the Vilcanota valley to the painted
    // churches of Andahuaylillas and Huaro.
    geofabrikRegion: 'south-america/peru',
    bounds: '-72.30,-13.70,-71.62,-13.20',
  },
  {
    slug: 'da-nang',
    // Same box as the destination's geofence and POI ingest: Hải Vân pass and Sơn Trà to Hội An,
    // Bà Nà hills in the west.
    geofabrikRegion: 'asia/vietnam',
    bounds: '107.95,15.84,108.36,16.21',
  },
];

/**
 * Guest places with a pack. Kept apart from the guide destinations: these boxes reach out to the
 * day trips, so they are wider than the place's own `place_bounds` and must never be written back
 * over it (`ingest-cli.ts --backfill-bounds` reads the guide list only).
 */
export const GUEST_PLACE_EXTRACTS: readonly DestinationExtract[] = [
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
  // The eight below: the place's own box widened by the 30 km day-trip reach.
  {
    slug: 'vn-ha-noi',
    geofabrikRegion: 'asia/vietnam',
    bounds: '105.4207,20.6241,106.2874,21.4326',
  },
  {
    slug: 'vn-ha-long',
    geofabrikRegion: 'asia/vietnam',
    bounds: '106.6613,20.6105,107.4387,21.2695',
  },
  {
    slug: 'vn-sa-pa',
    geofabrikRegion: 'asia/vietnam',
    bounds: '103.4886,22.0205,104.1914,22.6495',
  },
  { slug: 'vn-hue', geofabrikRegion: 'asia/vietnam', bounds: '107.2077,16.1010,107.9649,16.8269' },
  {
    slug: 'vn-sai-gon',
    geofabrikRegion: 'asia/vietnam',
    bounds: '106.3706,10.4558,107.0292,11.1026',
  },
  {
    slug: 'vn-mekong',
    geofabrikRegion: 'asia/vietnam',
    bounds: '105.4263,9.7005,106.1237,10.3695',
  },
  {
    slug: 'vn-phu-quoc',
    geofabrikRegion: 'asia/vietnam',
    bounds: '103.6155,9.8786,104.3021,10.5541',
  },
  {
    slug: 'vn-phong-nha',
    geofabrikRegion: 'asia/vietnam',
    bounds: '105.9334,17.3241,106.6124,17.9709',
  },
];

export function resolveGuideDestination(slug: string): DestinationExtract {
  const extracts = [...GUIDE_DESTINATION_EXTRACTS, ...GUEST_PLACE_EXTRACTS];
  const destination = extracts.find((entry) => entry.slug === slug);
  if (!destination) {
    const known = extracts.map((entry) => entry.slug).join(', ');
    throw new Error(
      `tiles: no box on record for "${slug}" (pass --bounds and --geofabrik-region); known: ${known}`,
    );
  }
  return destination;
}
