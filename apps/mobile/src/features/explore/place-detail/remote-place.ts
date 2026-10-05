/**
 * A place the phone does not hold yet. The phone carries a destination's recommended places and
 * the ones the plan or Ideas reference; search also lists places only the server has. When the
 * synced catalogue has no row for a place, its page reads it once from the api
 * (`GET /v1/places/{id}`) and draws from that, until the row syncs (saving or adding it does that).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, SQL and wire keys, never copy. */
import { shownPlaceName } from '@cp/domain';
import { useEffect, useState } from 'react';

import { useReadsLocalNames } from '@/data/places/use-shown-names';

import { useTravelDataReader } from '@/data/travel-data/client';

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
  | { readonly kind: 'ready'; readonly row: PoiRow; readonly remote: boolean }
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
 * The place's row: the synced one when the phone has it, else the api's. `destinationId` is the
 * destination the page was opened from (or the trip's), for the zone and the guide.
 */
export function usePlaceRow(placeId: string, destinationId: string | null): PlaceRowState {
  const local = usePoi(placeId);
  const reader = useTravelDataReader();
  const readsLocal = useReadsLocalNames(local.row?.destination_id ?? destinationId);
  // The page is titled with the name the reader sees; the other one is kept beside it.
  const named = (row: PoiRow): PoiRow => {
    const shown = shownPlaceName({ name: row.name, nameLocal: row.name_local }, readsLocal);
    return { ...row, name: shown.shown, name_local: shown.other };
  };
  const needed = local.loaded && local.row === null;
  const destination =
    useLiveRows<DestinationFacts>(
      DESTINATION_SQL,
      needed && destinationId !== null ? [destinationId] : null,
      DESTINATION_TABLES,
    ).rows[0] ?? NO_DESTINATION;
  const [attempt, setAttempt] = useState(0);
  const key = `${placeId}#${String(attempt)}`;
  const [answer, setAnswer] = useState<{ key: string; fetched: Fetched } | null>(null);
  useEffect(() => {
    if (!needed || reader === null) return undefined;
    const controller = new AbortController();
    reader.getJson(`/v1/places/${encodeURIComponent(placeId)}`, controller.signal).then(
      (response) => {
        if (controller.signal.aborted) return;
        setAnswer({ key, fetched: fetchedFrom(response.status, response.body) });
      },
      () => {
        if (!controller.signal.aborted) {
          setAnswer({ key, fetched: { kind: 'failed', offline: true } });
        }
      },
    );
    return () => controller.abort();
  }, [needed, reader, placeId, key]);

  if (local.row !== null) return { kind: 'ready', row: named(local.row), remote: false };
  const retry = () => setAttempt((n) => n + 1);
  // No session reader yet: nothing can be asked, which reads as no connection.
  if (needed && reader === null) return { kind: 'failed', offline: true, retry };
  if (!needed || answer === null || answer.key !== key) return { kind: 'waiting' };
  const { fetched } = answer;
  if (fetched.kind === 'missing') return { kind: 'missing' };
  if (fetched.kind === 'failed') return { kind: 'failed', offline: fetched.offline, retry };
  const row = remotePoiRow(fetched.body, destination);
  return row === null
    ? { kind: 'failed', offline: false, retry }
    : { kind: 'ready', row: named(row), remote: true };
}
