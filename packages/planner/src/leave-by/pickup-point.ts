/**
 * Placing a transfer's pickup from the text the traveller typed or the confirmation printed, with
 * no guessing: one of the destination's own POIs when its name clearly stands in the text, else a
 * Mapbox street address matched exactly or nearly so, and only inside the destination (within
 * 50 km of its centre). Streets, localities, cities and anything ambiguous stay unplaced.
 */
import { distanceM, type LatLng } from '@cp/domain';

/** How far from the destination's centre a pickup may be. */
export const PICKUP_RADIUS_M = 50_000;
/** The POI's name, as whole words, inside the pickup text (pg_trgm `strict_word_similarity`). */
export const PICKUP_WORD_SIMILARITY = 0.8;
/** The POI's name against the whole pickup text (pg_trgm `similarity`). */
export const PICKUP_SIMILARITY = 0.35;
/** Shorter names ("Hotel", "Lobby") say too little to place anyone. */
export const PICKUP_MIN_NAME_LETTERS = 8;
/** Two good matches further apart than this are two places, so neither is taken. */
const SAME_PLACE_M = 200;
const ACCEPTED_CONFIDENCE: ReadonlySet<string> = new Set(['exact', 'high']);

export interface OwnPlaceCandidate extends LatLng {
  readonly poiId: string;
  readonly name: string;
  readonly similarity: number;
  readonly wordSimilarity: number;
}

export interface AddressCandidate extends LatLng {
  readonly formattedAddress: string;
  readonly featureType: string | null;
  readonly confidence: string | null;
}

export interface PlacedPickup extends LatLng {
  readonly label: string;
  readonly source: 'poi' | 'mapbox';
  readonly poiId?: string;
}

interface TransferBooking {
  readonly location: string | null;
  readonly details: {
    readonly meeting_point?: unknown;
    readonly pick_up?: unknown;
    readonly pickup_point?: unknown;
  } | null;
}

/** The text a transfer's pickup is placed from: its location, else the printed meeting point. */
export function pickupText(booking: TransferBooking): string | null {
  for (const text of [booking.location, booking.details?.meeting_point, booking.details?.pick_up]) {
    if (typeof text === 'string' && text.trim() !== '') return text.trim();
  }
  return null;
}

/**
 * Whether the booking's pickup text still has to be placed: it has text, and no placement (found
 * or not) was made for exactly that text.
 */
export function pickupNeedsPlacing(booking: TransferBooking): boolean {
  const text = pickupText(booking);
  if (text === null) return false;
  const point = booking.details?.pickup_point as { from_text?: unknown } | undefined | null;
  return point?.from_text !== text;
}

/** The booking's placed pickup, while it was placed from the pickup text the booking has now. */
export function currentPickupPoint(booking: TransferBooking): (LatLng & { label: string }) | null {
  const text = pickupText(booking);
  const point = booking.details?.pickup_point as
    { from_text?: unknown; lat?: unknown; lng?: unknown; label?: unknown } | undefined | null;
  if (text === null || point?.from_text !== text) return null;
  if (typeof point.lat !== 'number' || typeof point.lng !== 'number') return null;
  return {
    lat: point.lat,
    lng: point.lng,
    label: typeof point.label === 'string' ? point.label : text,
  };
}

const letters = (name: string) => name.replace(/[^\p{L}\p{N}]/gu, '').length;

const inside = (centre: LatLng, point: LatLng) => distanceM(centre, point) <= PICKUP_RADIUS_M;

/** The one own POI the text names, or null when none or more than one place fits. */
export function acceptOwnPlace(
  candidates: readonly OwnPlaceCandidate[],
  centre: LatLng,
): PlacedPickup | null {
  const good = candidates.filter(
    (candidate) =>
      candidate.wordSimilarity >= PICKUP_WORD_SIMILARITY &&
      candidate.similarity >= PICKUP_SIMILARITY &&
      letters(candidate.name) >= PICKUP_MIN_NAME_LETTERS &&
      inside(centre, candidate),
  );
  const best = good[0];
  if (best === undefined) return null;
  if (good.some((other) => distanceM(best, other) > SAME_PLACE_M)) return null;
  return { lat: best.lat, lng: best.lng, label: best.name, source: 'poi', poiId: best.poiId };
}

/** The first Mapbox street address matched exactly or nearly so inside the destination. */
export function acceptAddress(
  candidates: readonly AddressCandidate[],
  centre: LatLng,
): PlacedPickup | null {
  const hit = candidates.find(
    (candidate) =>
      candidate.featureType === 'address' &&
      candidate.confidence !== null &&
      ACCEPTED_CONFIDENCE.has(candidate.confidence) &&
      inside(centre, candidate),
  );
  return hit === undefined
    ? null
    : { lat: hit.lat, lng: hit.lng, label: hit.formattedAddress, source: 'mapbox' };
}
