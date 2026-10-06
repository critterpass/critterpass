/**
 * Street addresses for what was typed, from the api's address lookup (`GET /v1/geocode`, Mapbox
 * behind our own places), leaning on the destination's centre (its places, phone or api). Asked once the typing rests, never per keystroke, and
 * only when `wantsAddresses` says so. The answer lives in this hook's state and goes with the
 * screen: an address is shown to the person who searched and is never saved as it came. A pick
 * only seeds DROP A PIN, where the traveller places the pin themselves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, SQL and wire values, never copy. */
import { useEffect, useMemo, useState } from 'react';

import type { GetPlaceJson } from '@/data/places/more-places';
import { useLiveRows } from '@/data/plan/live-rows';
import { dataOf } from '@/data/travel-data/freshness';

import { useDestinationPlaces, type BrowsePlace } from '../map-queries';

/** Typing has to rest this long before an address lookup is spent on it. */
export const ADDRESS_DEBOUNCE_MS = 700;
const ADDRESS_LIMIT = 4;

const CENTRE_SQL = `SELECT avg(lat) AS lat, avg(lng) AS lng FROM pois
  WHERE destination_id = ? AND status = 'active'`;

export interface AddressPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface FoundAddress extends AddressPoint {
  /** "12 Trần Phú": the first part of the address, the row's title and the pin's first name. */
  readonly line: string;
  /** "Hải Châu, Đà Nẵng, Vietnam": the rest, or null. */
  readonly rest: string | null;
}

export interface AddressCredit {
  readonly label: string;
  readonly url: string;
}

export type AddressesState =
  | { readonly kind: 'none' }
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'done';
      readonly addresses: readonly FoundAddress[];
      readonly credits: readonly AddressCredit[];
    };

interface Found {
  readonly key: string;
  readonly addresses: readonly FoundAddress[];
  readonly credits: readonly AddressCredit[];
}

/** The address rows of a `/v1/geocode` answer: Mapbox's only (our own places are already listed). */
export function addressesFrom(body: unknown): Omit<Found, 'key'> {
  const answer = body as { results?: unknown; attribution?: unknown } | null;
  const results = Array.isArray(answer?.results) ? answer.results : [];
  const addresses = results.flatMap((raw: unknown): FoundAddress[] => {
    const row = raw as { source?: unknown; label?: unknown; lat?: unknown; lng?: unknown };
    if (row.source !== 'mapbox' || typeof row.label !== 'string') return [];
    if (typeof row.lat !== 'number' || typeof row.lng !== 'number') return [];
    const [line = '', ...rest] = row.label.split(',').map((part) => part.trim());
    if (line === '') return [];
    return [{ line, rest: rest.length === 0 ? null : rest.join(', '), lat: row.lat, lng: row.lng }];
  });
  const credits = (Array.isArray(answer?.attribution) ? answer.attribution : []).flatMap(
    (raw: unknown): AddressCredit[] => {
      const credit = raw as { label?: unknown; url?: unknown };
      return typeof credit.label === 'string' && typeof credit.url === 'string'
        ? [{ label: credit.label, url: credit.url }]
        : [];
    },
  );
  return { addresses, credits };
}

/** What the section shows for the text in the field now: an older answer never stands in. */
export function addressesState(wanted: boolean, key: string, found: Found | null): AddressesState {
  if (!wanted) return { kind: 'none' };
  if (found?.key !== key) return { kind: 'loading' };
  return { kind: 'done', addresses: found.addresses, credits: found.credits };
}

/** The middle of the phone's places, else of the api's browse (or its last good copy). */
export function centreOf(
  held: { readonly lat: number | null; readonly lng: number | null } | undefined,
  browsed: readonly BrowsePlace[],
): AddressPoint | null {
  if (held !== undefined && held.lat !== null && held.lng !== null) {
    return { lat: held.lat, lng: held.lng };
  }
  if (browsed.length === 0) return null;
  const sum = browsed.reduce(
    (acc, place) => ({ lat: acc.lat + place.lat, lng: acc.lng + place.lng }),
    {
      lat: 0,
      lng: 0,
    },
  );
  return { lat: sum.lat / browsed.length, lng: sum.lng / browsed.length };
}

/** The middle of the destination's places: where an address search leans and a pin starts. */
export function useDestinationCentre(destinationId: string | null): AddressPoint | null {
  const held = useLiveRows<{ lat: number | null; lng: number | null }>(
    CENTRE_SQL,
    destinationId === null ? null : [destinationId],
    ['pois'],
  ).rows[0];
  const browsed = dataOf(useDestinationPlaces(destinationId))?.results;
  const lat = held?.lat ?? null;
  const lng = held?.lng ?? null;
  return useMemo(() => centreOf({ lat, lng }, browsed ?? []), [lat, lng, browsed]);
}

export function useAddresses(options: {
  readonly getJson: GetPlaceJson;
  readonly query: string;
  /** The search's own point (a place, the stay), else the destination's centre; null = don't ask. */
  readonly near: AddressPoint | null;
  /** From `wantsAddresses`. */
  readonly wanted: boolean;
}): AddressesState {
  const { getJson, near } = options;
  const query = options.query.trim();
  const wanted = near !== null && options.wanted;
  const nearText = near === null ? '' : `${near.lat.toFixed(4)},${near.lng.toFixed(4)}`;
  const key = `${nearText}\u0000${query}`;
  const [found, setFound] = useState<Found | null>(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        near: nearText,
        limit: String(ADDRESS_LIMIT),
      });
      void getJson(`/v1/geocode?${params.toString()}`).then((read) => {
        if (!live) return;
        setFound({
          key,
          ...(read.kind === 'ok' ? addressesFrom(read.body) : { addresses: [], credits: [] }),
        });
      });
    }, ADDRESS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [getJson, query, nearText, key, wanted]);
  return addressesState(wanted, key, found);
}
