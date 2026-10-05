/**
 * The page's place: the phone's row when it holds one (the trip's own places, a destination's
 * recommended ones), else the api's (`GET /v1/places/{id}`, `@/data/places/place-read`), which
 * keeps its last good copy so a place seen once opens offline. The api is asked either way for the
 * place's AI profile, which only it has.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, SQL and wire keys, never copy. */
import { shownPlaceName } from '@cp/domain';
import { useState } from 'react';

import { editorialTextFor } from '@/data/places/editorial-note';
import { usePlaceRead, type PlaceProfile } from '@/data/places/place-read';
import { dataOf } from '@/data/travel-data/freshness';
import { useActiveLocale } from '@/lib/i18n/use-locale';
import { useReadsLocalNames } from '@/data/places/use-shown-names';

import { useLiveRows } from '../data/live-rows';
import { usePoi, type PoiRow } from '../place-queries';

type Bag = Readonly<Record<string, unknown>>;
const str = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const json = (value: unknown): string | null =>
  typeof value === 'object' && value !== null ? JSON.stringify(value) : null;

export interface DestinationFacts {
  readonly id: string | null;
  readonly tz: string | null;
  readonly name: string | null;
  readonly slug: string | null;
  readonly guide_slug: string | null;
}

/** The api's place as the page's row; null when the answer is not a place. */
export function remotePoiRow(body: unknown, destination: DestinationFacts): PoiRow | null {
  if (typeof body !== 'object' || body === null) return null;
  const place = body as Bag;
  const id = str(place['id']);
  const name = str(place['name']);
  if (id === null || name === null) return null;
  return {
    id,
    destination_id: str(place['destinationId']) ?? destination.id,
    name,
    name_local: str(place['nameLocal']),
    category: str(place['category']) ?? 'other',
    lat: num(place['lat']),
    lng: num(place['lng']),
    address: str(place['address']),
    hours: json(place['hours']),
    price_level: num(place['priceLevel']),
    editorial: json(place['editorial']),
    timezone: str(place['timezone']),
    destination_tz: destination.tz,
    destination_name: destination.name,
    destination_slug: destination.slug,
    guide_slug: destination.guide_slug,
  };
}

const DESTINATION_SQL = `SELECT d.id, d.tz, d.name, d.slug,
    (SELECT s.guide_slug FROM critter_sets s
      WHERE s.destination_id = d.id AND s.guide_slug IS NOT NULL LIMIT 1) AS guide_slug
  FROM destinations d WHERE d.id = ?`;
const DESTINATION_TABLES = ['destinations', 'critter_sets'];
const NO_DESTINATION: DestinationFacts = {
  id: null,
  tz: null,
  name: null,
  slug: null,
  guide_slug: null,
};

export type PlaceRowState =
  | {
      readonly kind: 'ready';
      readonly row: PoiRow;
      readonly remote: boolean;
      /** The AI-written profile, when the api has one (or is writing it). */
      readonly profile: PlaceProfile | null;
    }
  /** The phone has not answered yet, or the api is being asked. */
  | { readonly kind: 'waiting' }
  /** The api has no such place. */
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly offline: boolean; readonly retry: () => void };

type Fetched =
  | { readonly kind: 'ok'; readonly body: unknown }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly offline: boolean };

/** What a response of the place route means for the page. */
export function fetchedFrom(status: number, body: unknown): Fetched {
  if (status === 404) return { kind: 'missing' };
  if (status < 200 || status >= 300) return { kind: 'failed', offline: false };
  return { kind: 'ok', body };
}

/**
 * The place's row: the synced one when the phone has it, else the api's or its last good copy.
 * `destinationId` is the destination the page was opened from (or the trip's), for the zone and
 * the guide.
 */
export function usePlaceRow(placeId: string, destinationId: string | null): PlaceRowState {
  const local = usePoi(placeId);
  const [attempt, setAttempt] = useState(0);
  const read = usePlaceRead(placeId, attempt);
  const wire = dataOf(read) ?? null;
  const readsLocal = useReadsLocalNames(
    local.row?.destination_id ?? wire?.destinationId ?? destinationId,
  );
  const locale = useActiveLocale();
  // The page is titled with the name the reader sees; the other one is kept beside it.
  const named = (row: PoiRow): PoiRow => {
    const shown = shownPlaceName({ name: row.name, nameLocal: row.name_local }, readsLocal);
    return {
      ...row,
      name: shown.shown,
      name_local: shown.other,
      editorial: editorialTextFor(row.editorial, locale),
    };
  };
  const needed = local.loaded && local.row === null;
  const destinationOf = wire?.destinationId ?? destinationId;
  const destination =
    useLiveRows<DestinationFacts>(
      DESTINATION_SQL,
      needed && destinationOf !== null ? [destinationOf] : null,
      DESTINATION_TABLES,
    ).rows[0] ?? NO_DESTINATION;
  const profile = wire?.profile ?? null;

  if (local.row !== null) return { kind: 'ready', row: named(local.row), remote: false, profile };
  if (!local.loaded) return { kind: 'waiting' };
  const retry = () => setAttempt((n) => n + 1);
  if (wire !== null) {
    const row = remotePoiRow(wire, destination);
    return row === null
      ? { kind: 'failed', offline: false, retry }
      : { kind: 'ready', row: named(row), remote: true, profile };
  }
  if (read.status === 'loading') return { kind: 'waiting' };
  if (read.status === 'missing' && read.reason === 'not_found') return { kind: 'missing' };
  return {
    kind: 'failed',
    offline: read.status === 'missing' && read.reason === 'offline',
    retry,
  };
}
