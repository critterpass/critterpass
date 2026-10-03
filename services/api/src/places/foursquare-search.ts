/**
 * One Foursquare Place Search call for the live search fallback (`./live-search.ts`). Pro fields
 * only (id, name, point, categories, address, distance): Premium fields are billed per result and
 * are fetched one place at a time by `GET /v1/places/{id}/live` instead. The response is mapped and
 * returned; nothing here is stored (Foursquare's terms allow keeping only `fsq_place_id`).
 */
import { mapSourceCategoriesToTaxonomy, type PoiCategory } from '@cp/domain';
import { z } from 'zod';

import type { FoursquareLiveConfig } from './live';

export const FOURSQUARE_SEARCH_FIELDS =
  'fsq_place_id,name,latitude,longitude,categories,location,distance';

const DEFAULT_API_VERSION = '2025-06-17';
const DEFAULT_BASE_URL = 'https://places-api.foursquare.com';
const DEFAULT_TIMEOUT_MS = 2_500;
/** Foursquare caps `radius` at 100 km. */
const MAX_RADIUS_M = 100_000;

export interface FoursquareSearchPlace {
  readonly fsqPlaceId: string;
  readonly name: string;
  readonly category: PoiCategory;
  readonly lat: number;
  readonly lng: number;
  readonly address: string | null;
  readonly distanceM: number | null;
}

/** Where to search: around a point, or near a place name Foursquare geocodes ("Hội An, Vietnam"). */
export type FoursquareSearchArea =
  | { readonly kind: 'point'; readonly lat: number; readonly lng: number; readonly radiusM: number }
  | { readonly kind: 'near'; readonly text: string };

const resultSchema = z.object({
  fsq_place_id: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  categories: z
    .array(z.object({ name: z.string() }))
    .optional()
    .catch(undefined),
  location: z.object({ formatted_address: z.string().optional() }).optional().catch(undefined),
  distance: z.number().nonnegative().optional().catch(undefined),
});

/** Maps a Place Search body; results that do not parse are dropped, not thrown. */
export function mapFoursquareSearch(body: unknown): FoursquareSearchPlace[] {
  const results = z.object({ results: z.array(z.unknown()) }).safeParse(body);
  if (!results.success) return [];
  const places: FoursquareSearchPlace[] = [];
  for (const raw of results.data.results) {
    const parsed = resultSchema.safeParse(raw);
    if (!parsed.success) continue;
    const result = parsed.data;
    const address = result.location?.formatted_address?.trim();
    places.push({
      fsqPlaceId: result.fsq_place_id,
      name: result.name,
      category: mapSourceCategoriesToTaxonomy((result.categories ?? []).map((entry) => entry.name)),
      lat: result.latitude,
      lng: result.longitude,
      address: address === undefined || address.length === 0 ? null : address,
      distanceM: result.distance ?? null,
    });
  }
  return places;
}

/** Throws on a non-200 answer or a timeout; the caller turns that into "no live results". */
export async function searchFoursquare(
  config: FoursquareLiveConfig,
  query: string,
  area: FoursquareSearchArea,
  limit: number,
): Promise<FoursquareSearchPlace[]> {
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    fields: FOURSQUARE_SEARCH_FIELDS,
  });
  if (area.kind === 'point') {
    params.set('ll', `${area.lat},${area.lng}`);
    params.set('radius', String(Math.min(MAX_RADIUS_M, Math.round(area.radiusM))));
  } else {
    params.set('near', area.text);
  }
  const response = await (config.fetch ?? globalThis.fetch)(
    `${config.baseUrl ?? DEFAULT_BASE_URL}/places/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'X-Places-Api-Version': config.apiVersion ?? DEFAULT_API_VERSION,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`foursquare place search ${response.status}`);
  return mapFoursquareSearch(await response.json());
}
