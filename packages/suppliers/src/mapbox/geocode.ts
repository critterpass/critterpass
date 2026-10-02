/**
 * Mapbox Geocoding v6 forward client: permanent-mode geocodes (Mapbox Product Terms §2.7.3 lets us
 * store them), used by `/v1/geocode` once our own POIs and cities have no match and by the worker
 * to place a booking's pickup. Verified against the live API on 2026-09-27; answers recorded on
 * 2026-10-03 live in `services/worker/test/trip-day/fixtures/mapbox-geocode`.
 * `GET https://api.mapbox.com/search/geocode/v6/forward?q=<query>&permanent=true&access_token=<token>`
 * returns a GeoJSON `FeatureCollection` whose
 * features carry `geometry.coordinates` as `[lng, lat]`, `properties.feature_type`,
 * `properties.full_address` / `properties.place_formatted` / `properties.context.country.name`, and
 * on address results `properties.match_code.confidence` (`exact`, `high`, `medium`, `low`).
 */
import { DomainError } from '@cp/domain';

export interface MapboxHttpClient {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface MapboxGeocoderConfig {
  readonly accessToken: string;
  readonly baseUrl?: string;
}

/** Narrows a forward search; every field is optional and absent ones are not sent. */
export interface MapboxForwardOptions {
  /** v6 feature types, e.g. `['address']`. */
  readonly types?: readonly string[];
  /** Bias results toward this point. */
  readonly proximity?: { readonly lat: number; readonly lng: number };
  readonly limit?: number;
}

export interface MapboxForwardResult {
  readonly lat: number;
  readonly lng: number;
  readonly formattedAddress: string;
  readonly placeFormatted: string;
  readonly country: string | null;
  /** `address`, `street`, `locality`, `place`, …; null when Mapbox left it out. */
  readonly featureType: string | null;
  /** How well an address matched the query; null on every other feature type. */
  readonly confidence: string | null;
}

interface MapboxFeature {
  readonly geometry: { readonly coordinates: readonly [number, number] };
  readonly properties: {
    readonly feature_type?: string;
    readonly full_address?: string;
    readonly place_formatted?: string;
    readonly name?: string;
    readonly context?: { readonly country?: { readonly name?: string } };
    readonly match_code?: { readonly confidence?: string };
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
  options: MapboxForwardOptions = {},
): Promise<readonly MapboxForwardResult[]> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  let url =
    `${baseUrl}/search/geocode/v6/forward?q=${encodeURIComponent(query)}` +
    `&limit=${options.limit ?? RESULT_LIMIT}&permanent=true`;
  if (options.types !== undefined && options.types.length > 0) {
    url += `&types=${options.types.map(encodeURIComponent).join(',')}`;
  }
  if (options.proximity !== undefined) {
    url += `&proximity=${options.proximity.lng},${options.proximity.lat}`;
  }

  const response = await httpClient.fetch(`${url}&access_token=${config.accessToken}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
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
    featureType: feature.properties.feature_type ?? null,
    confidence: feature.properties.match_code?.confidence ?? null,
  }));
}
