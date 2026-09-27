/**
 * Mapbox Geocoding v6 forward client: permanent-mode fallback for addresses once our own POIs and
 * cities have no match. Verified against the live API with the project's real token (2026-09-27):
 * `GET https://api.mapbox.com/search/geocode/v6/forward?
 * q=<query>&permanent=true&access_token=<token>` returns a GeoJSON `FeatureCollection` whose
 * features carry `geometry.coordinates` as `[lng, lat]` and `properties.full_address` /
 * `properties.place_formatted` / `properties.context.country.name`.
 */
import { DomainError } from '@cp/domain';

export interface MapboxHttpClient {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface MapboxGeocoderConfig {
  readonly accessToken: string;
  readonly baseUrl?: string;
}

export interface MapboxForwardResult {
  readonly lat: number;
  readonly lng: number;
  readonly formattedAddress: string;
  readonly placeFormatted: string;
  readonly country: string | null;
}

interface MapboxFeature {
  readonly geometry: { readonly coordinates: readonly [number, number] };
  readonly properties: {
    readonly full_address?: string;
    readonly place_formatted?: string;
    readonly name?: string;
    readonly context?: { readonly country?: { readonly name?: string } };
  };
}

interface MapboxFeatureCollection {
  readonly features: readonly MapboxFeature[];
}

const DEFAULT_BASE_URL = 'https://api.mapbox.com';
const REQUEST_TIMEOUT_MS = 10_000;
const RESULT_LIMIT = 5;

/**
 * Forward-geocodes free text via Mapbox. Never throws for "no results" (returns `[]`); throws
 * `UPSTREAM_TIMEOUT` only for a genuine upstream failure.
 */
export async function geocodeForwardMapbox(
  query: string,
  config: MapboxGeocoderConfig,
  httpClient: MapboxHttpClient = globalThis,
): Promise<readonly MapboxForwardResult[]> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const url =
    `${baseUrl}/search/geocode/v6/forward?q=${encodeURIComponent(query)}` +
    `&limit=${RESULT_LIMIT}&permanent=true&access_token=${config.accessToken}`;

  const response = await httpClient.fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) {
    throw new DomainError('UPSTREAM_TIMEOUT', {
      reason: 'mapbox geocode failed',
      status: response.status,
    });
  }

  const body = (await response.json()) as MapboxFeatureCollection;
  return body.features.map((feature) => ({
    lng: feature.geometry.coordinates[0],
    lat: feature.geometry.coordinates[1],
    formattedAddress: feature.properties.full_address ?? feature.properties.name ?? '',
    placeFormatted: feature.properties.place_formatted ?? '',
    country: feature.properties.context?.country?.name ?? null,
  }));
}
