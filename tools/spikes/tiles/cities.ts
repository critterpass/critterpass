/** One-city registry for the tiles spike; add a row here before adding a new `--city` value. */
export interface CityExtract {
  /** Geofabrik region path relative to https://download.geofabrik.de/, no `.osm.pbf` suffix. */
  readonly geofabrikRegion: string;
  /** `minLon,minLat,maxLon,maxLat` passed to planetiler's `--bounds`. */
  readonly bounds: string;
}

export const CITY_EXTRACTS: Record<string, CityExtract> = {
  'da-nang': {
    geofabrikRegion: 'asia/vietnam',
    // Covers the city core, Son Tra peninsula and the Ba Na hills approach.
    bounds: '107.95,15.92,108.35,16.20',
  },
};

export function resolveCity(name: string): CityExtract {
  const city = CITY_EXTRACTS[name];
  if (!city) {
    throw new Error(
      `tiles spike: unknown --city "${name}"; known cities: ${Object.keys(CITY_EXTRACTS).join(', ')}`,
    );
  }
  return city;
}
