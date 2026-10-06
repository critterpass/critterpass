/**
 * The must-dos step's places, read through the api (`GET /v1/places/search`): the destination's
 * browse (no query, recommended first, up to 300) for the examples and the offline search, and a
 * typed search while there is signal. The phone holds only the trip's own place cards, so a place
 * it never synced is as good a must-do as one it holds. The browse keeps its last good copy, so
 * offline the step offers and finds what it showed last.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, storage keys and wire keys, never copy. */
import { hoursSchema, type Hours } from '@cp/domain';

import {
  createLastGoodCache,
  readThrough,
  type LastGoodCache,
  type ReaderResponse,
  type TravelDataReader,
  type WireParser,
} from '@/data/travel-data/client';
import type { ReadState } from '@/data/travel-data/freshness';

import type { SetupServices } from '../data/services';

/** A place as `/v1/places/search` answers it (services/api/src/places/search.ts). */
export interface CandidatePlace {
  readonly id: string;
  readonly name: string;
  readonly nameLocal: string | null;
  readonly category: string;
  readonly address: string | null;
  readonly tags: readonly string[];
  /** In the curated set, or a machine pick where nothing is curated. */
  readonly recommended: boolean;
  readonly hours: Hours | null;
  /** One of the editors' must-sees. */
  readonly mustSee: boolean;
  /** The pick job's order (1 first), or null when not picked. */
  readonly pickRank: number | null;
  /** The reviewed note's (or AI profile's) line in the reader's language, or null. */
  readonly whyGo: string | null;
}

export interface CandidatesWire {
  readonly results: readonly CandidatePlace[];
}

/** The api's most places in one destination browse. */
export const BROWSE_LIMIT = 300;
/** Destinations whose browse is kept for offline; past this the oldest is dropped. */
const BROWSE_CACHE_MAX = 20;

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const line = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

function hoursOf(value: unknown): Hours | null {
  const parsed = hoursSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function candidate(value: unknown): CandidatePlace[] {
  if (typeof value !== 'object' || value === null) return [];
  const row = value as Readonly<Record<string, unknown>>;
  const id = text(row['id']);
  const name = text(row['name']);
  if (id === null || name === null || name === '') return [];
  const rank = row['pickRank'];
  return [
    {
      id,
      name,
      nameLocal: text(row['nameLocal']),
      category: text(row['category']) ?? 'other',
      address: text(row['address']),
      tags: Array.isArray(row['tags'])
        ? row['tags'].filter((tag): tag is string => typeof tag === 'string')
        : [],
      recommended: row['recommended'] === true,
      hours: hoursOf(row['hours']),
      mustSee: row['mustSee'] === true,
      pickRank: typeof rank === 'number' && Number.isFinite(rank) ? rank : null,
      whyGo: line(row['whyGo']),
    },
  ];
}

/** The places in the api's order; unreadable rows are skipped, a non-list is no answer. */
export const candidatesSchema: WireParser<CandidatesWire> = {
  safeParse(value) {
    const results = (value as { results?: unknown } | null)?.results;
    if (!Array.isArray(results)) return { success: false };
    return { success: true, data: { results: results.flatMap(candidate) } };
  },
};

export function browsePath(destinationId: string): string {
  return `/v1/places/search?destination_id=${encodeURIComponent(destinationId)}&limit=${String(BROWSE_LIMIT)}`;
}

export function searchPath(query: string, destinationId: string | null, limit: number): string {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (destinationId !== null) params.set('destination_id', destinationId);
  return `/v1/places/search?${params.toString()}`;
}

/** The setup step's api as a travel-data reader: no answer at all reads as offline. */
export function readerOf(services: SetupServices): TravelDataReader {
  return {
    async getJson(path): Promise<ReaderResponse> {
      const read = await services.getJson(path);
      if (read.kind === 'offline') throw new TypeError('offline');
      return read.kind === 'ok'
        ? { status: 200, body: read.body }
        : { status: read.status, body: null };
    },
  };
}

let shared: LastGoodCache | undefined;

function browseCache(): LastGoodCache {
  shared ??= createLastGoodCache('cp-must-do-places', { max: BROWSE_CACHE_MAX });
  return shared;
}

/** One browse: the api's answer (kept as the last good copy), else that copy, else missing. */
export function readBrowse(
  reader: TravelDataReader,
  destinationId: string,
  cache: LastGoodCache = browseCache(),
): Promise<ReadState<CandidatesWire>> {
  return readThrough({
    reader,
    cache,
    path: browsePath(destinationId),
    schema: candidatesSchema,
    classify: () => ({ status: 'ok', seenAt: null }),
  });
}

/** One typed search; null when the api gave no usable answer (the caller falls back offline). */
export async function readSearch(
  reader: TravelDataReader,
  query: string,
  destinationId: string | null,
  limit: number,
): Promise<readonly CandidatePlace[] | null> {
  try {
    const response = await reader.getJson(searchPath(query, destinationId, limit));
    if (response.status < 200 || response.status >= 300) return null;
    const parsed = candidatesSchema.safeParse(response.body);
    return parsed.success ? parsed.data.results : null;
  } catch {
    return null;
  }
}
