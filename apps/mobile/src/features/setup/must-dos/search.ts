/**
 * The add sheet's search (3c-10): places matching every keystroke (debounced 120 ms), from
 * `/v1/places/search` biased to the trip's destination, or
 * from the destination's places already on the phone when there is no signal, by the shared folded
 * match (data/places). Each result carries its pill, decided from what is known
 * before a draft exists: a lottery or book-ahead tag, else whether the place is open on any trip
 * day (FITS, or CLASH when it is closed on all of them); unknown hours carry no pill.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, a route path and wire values, never copy. */
import { hoursSchema, WEEKDAYS, type Hours } from '@cp/domain';
import { useEffect, useState } from 'react';

import { matchPlaces } from '@/data/places/match-places';
import { useLocalFirst } from '@/data/powersync/local-first-context';

import { parseIdList, parseJson } from '../data/rows';
import type { SetupServices } from '../data/services';
import type { FitPill } from './model';

export const SEARCH_DEBOUNCE_MS = 120;
const LIMIT = 6;

export interface PlaceResult {
  readonly id: string;
  readonly name: string;
  readonly blurb: string | null;
  readonly pill: FitPill | null;
}

export type SearchState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly results: readonly PlaceResult[]; readonly offline: boolean };

interface LocalPlace {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly tags: string | null;
  readonly hours: string | null;
  readonly editorial: string | null;
  readonly name_local?: string | null;
  readonly category?: string | null;
}

interface OnlinePlace {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly tags: readonly string[];
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let at = Date.parse(`${start}T00:00:00Z`); at <= Date.parse(`${end}T00:00:00Z`);) {
    dates.push(new Date(at).toISOString().slice(0, 10));
    at += 86_400_000;
  }
  return dates;
}

/** Open on at least one trip day; null when the hours or the dates are unknown. */
export function openOnDates(hours: Hours | null, dates: readonly string[]): boolean | null {
  if (hours === null || Object.keys(hours.weekly).length === 0 || dates.length === 0) return null;
  return dates.some((date) => {
    const exception = hours.exceptions?.find((entry) => entry.date === date);
    if (exception !== undefined) return exception.spans.length > 0;
    const weekday = WEEKDAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7] ?? 'mo';
    return (hours.weekly[weekday] ?? []).length > 0;
  });
}

export function pillFor(
  tags: readonly string[],
  hours: Hours | null,
  dates: readonly string[],
): FitPill | null {
  if (tags.includes('lottery')) return { kind: 'lottery', closes: null };
  if (tags.some((tag) => tag === 'book_ahead' || tag.startsWith('book_ahead:'))) {
    return { kind: 'book_ahead', by: null };
  }
  const open = openOnDates(hours, dates);
  if (open === null) return null;
  return open ? { kind: 'fits', day: null } : { kind: 'clash' };
}

function hoursOf(value: string | null): Hours | null {
  const parsed = hoursSchema.safeParse(parseJson<unknown>(value, null));
  return parsed.success ? parsed.data : null;
}

function blurbOf(local: LocalPlace | undefined, address: string | null): string | null {
  const why = parseJson<{ why_go?: unknown }>(local?.editorial, {}).why_go;
  return typeof why === 'string' && why !== '' ? why : address;
}

const LOCAL_SQL = `SELECT id, name, name_local, category, address, tags, hours, editorial FROM pois
  WHERE destination_id = ? AND status = 'active' AND merged_into_id IS NULL`;

/** The destination's places on the phone matching `query`, by the shared folded match. */
function matchLocal(rows: readonly LocalPlace[], query: string): LocalPlace[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const candidates = rows.map((row) => ({
    id: row.id,
    poiId: row.id,
    name: row.name,
    nameLocal: row.name_local ?? null,
    category: row.category ?? null,
    lat: null,
    lng: null,
    tags: parseIdList(row.tags),
    source: 'curated' as const,
  }));
  return matchPlaces(candidates, query, { limit: LIMIT }).flatMap((place) => {
    const row = byId.get(place.id);
    return row === undefined ? [] : [row];
  });
}

export function useMustDoSearch(options: {
  readonly services: SetupServices;
  readonly destinationId: string | null;
  readonly query: string;
  readonly dates: readonly string[];
}): SearchState {
  const { db } = useLocalFirst();
  const { services, destinationId } = options;
  const query = options.query.trim();
  const dateKey = options.dates.join(',');
  const key = `${destinationId ?? ''}\u0000${query}\u0000${dateKey}`;
  const [found, setFound] = useState<{ readonly key: string; readonly state: SearchState } | null>(
    null,
  );
  useEffect(() => {
    if (query === '') return undefined;
    let live = true;
    const dates = dateKey === '' ? [] : dateKey.split(',');
    const timer = setTimeout(() => {
      void (async () => {
        const params = new URLSearchParams({ q: query, limit: String(LIMIT) });
        if (destinationId !== null) params.set('destination_id', destinationId);
        const read = await services.getJson(`/v1/places/search?${params.toString()}`);
        const online =
          read.kind === 'ok'
            ? ((read.body as { results?: OnlinePlace[] } | null)?.results ?? [])
            : null;
        const local =
          online !== null
            ? await db.getAll<LocalPlace>(
                `SELECT id, name, address, tags, hours, editorial FROM pois WHERE id IN (${online
                  .map(() => '?')
                  .join(',')})`,
                online.map((place) => place.id),
              )
            : destinationId === null
              ? []
              : matchLocal(await db.getAll<LocalPlace>(LOCAL_SQL, [destinationId]), query);
        const byId = new Map(local.map((place) => [place.id, place]));
        const places = (
          online ??
          local.map((place) => ({
            id: place.id,
            name: place.name,
            address: place.address,
            tags: parseIdList(place.tags),
          }))
        ).map((place) => {
          const known = byId.get(place.id);
          return {
            id: place.id,
            name: place.name,
            blurb: blurbOf(known, place.address),
            pill: pillFor(place.tags, hoursOf(known?.hours ?? null), dates),
          };
        });
        if (live)
          setFound({ key, state: { kind: 'done', results: places, offline: online === null } });
      })().catch(() => {
        if (live) setFound({ key, state: { kind: 'done', results: [], offline: true } });
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [db, services, destinationId, query, dateKey, key]);
  if (query === '') return { kind: 'idle' };
  if (found?.key === key) return found.state;
  // While the next keystroke's results load, keep the last ones on screen.
  return found?.state.kind === 'done' ? found.state : { kind: 'loading' };
}

export function tripDates(start: string | null, end: string | null): string[] {
  return start === null || end === null ? [] : datesBetween(start, end);
}
