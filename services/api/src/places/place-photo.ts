/**
 * The one photo a list row or a map card shows of a place from our own store: none. The profile
 * photos found by web search and re-hosted carried no licence we could check, so they are no
 * longer offered; the photo slot stays (null) for a licensed source. Readers keep the same SQL
 * column and parse so the slot fills in one place.
 */

export interface PlacePhoto {
  readonly url: string;
  /** The page the photo came from: its credit. */
  readonly sourcePage: string;
}

/** A place's stored photos, as SQL over the place and its profile row: none (NULL). */
export function shownProfilePhotosSql(_poi = 'p', _profile = 'pp'): string {
  return 'NULL::jsonb';
}

/** The photo a row shows from what `shownProfilePhotosSql` read: none. */
export function firstProfilePhoto(_photos: unknown, _mediaBaseUrl?: string): PlacePhoto | null {
  return null;
}
