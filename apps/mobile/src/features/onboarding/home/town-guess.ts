/**
 * "Did you mean" on the home search (2.10): when no airport matches what was typed, the api's
 * geocoder (`/v1/geocode`: our own towns first, the map provider for a misspelling) names the town,
 * and the bundled airports give its nearest one. A position (a guessed town, or the phone's own
 * one-shot fix) becomes the same hint the network gives, so the nearest airports list under it.
 */
import { nearestAirports, type Airport, type GeoHint } from '@cp/domain';

export interface TownGuess {
  /** "Ubud": the first part of the place's label. */
  readonly town: string;
  /** "Bali, Indonesia": the rest of it, or null. */
  readonly region: string | null;
  /** The nearest airport people fly from. */
  readonly iata: string;
}

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** The first town-like answer of a `/v1/geocode` body (a city of ours or the map provider's). */
export function townPointFrom(body: unknown): (LatLng & { readonly label: string }) | null {
  const results = (body as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return null;
  for (const raw of results as unknown[]) {
    const row = raw as { source?: unknown; label?: unknown; lat?: unknown; lng?: unknown };
    if (row.source !== 'city' && row.source !== 'mapbox') continue;
    if (typeof row.label !== 'string' || row.label.trim() === '') continue;
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') continue;
    return { label: row.label, lat: row.lat, lng: row.lng };
  }
  return null;
}

/** The guess for a geocoded place: its name and region, and its nearest airport. */
export function townGuess(
  airports: readonly Airport[],
  place: LatLng & { readonly label: string },
): TownGuess | null {
  const [town = '', ...rest] = place.label.split(',').map((part) => part.trim());
  const nearest = nearestAirports(airports, place, 1)[0];
  if (town === '' || nearest === undefined) return null;
  return { town, region: rest.length === 0 ? null : rest.join(', '), iata: nearest.airport.iata };
}

/** A position as the search's hint: its nearest airports list first. */
export function hintAt(airports: readonly Airport[], point: LatLng): GeoHint {
  return {
    country: null,
    city: null,
    point,
    nearest_iata: nearestAirports(airports, point, 3).map((near) => near.airport.iata),
  };
}
