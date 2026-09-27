/**
 * The travel-data read path: authenticated GETs to the api's cached travel-data routes, each good
 * answer persisted as the last good copy (MMKV), and a pure `readThrough` that turns an answer, a
 * failure or the saved copy into a `ReadState`: offline shows the last good copy as stale (never a
 * blank screen, never an invented value); no copy at all is `missing`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, storage key or wire value, never copy. */
import { createContext, useContext } from 'react';
import { createMMKV } from 'react-native-mmkv';

import { resolveApiBaseUrl } from '../places/apiBaseUrl';
import type { MissingReason, ReadState, StaleReason } from './freshness';

export interface ReaderResponse {
  readonly status: number;
  readonly body: unknown;
}

/** One GET against the api; a thrown error means no response at all (offline, timeout). */
export interface TravelDataReader {
  getJson(path: string, signal?: AbortSignal): Promise<ReaderResponse>;
}

export interface TravelDataReaderOptions {
  readonly baseUrl?: string;
  /** Session headers per request, e.g. `{cookie}` from the Better Auth Expo client. */
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

function parseBody(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createTravelDataReader(options: TravelDataReaderOptions): TravelDataReader {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ?? resolveApiBaseUrl();
  const timeoutMs = options.timeoutMs ?? 20_000;
  return {
    async getJson(path, signal) {
      // AbortController + timer rather than AbortSignal.timeout/any, which Hermes lacks.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const cancel = () => controller.abort();
      signal?.addEventListener('abort', cancel);
      let response: Response;
      try {
        response = await doFetch(`${baseUrl}${path}`, {
          headers: { accept: 'application/json', ...(await options.sessionHeaders()) },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      }
      const text = await response.text();
      return { status: response.status, body: parseBody(text) };
    },
  };
}

const TravelDataReaderContext = createContext<TravelDataReader | null>(null);

/** The app root provides the reader once a session exists. */
export const TravelDataReaderProvider = TravelDataReaderContext.Provider;

export function useTravelDataReader(): TravelDataReader | null {
  return useContext(TravelDataReaderContext);
}

/** Last good answers, keyed by route + query; `createMMKV` is in-memory under Jest. */
export interface LastGoodCache {
  get(key: string): { readonly savedAt: string; readonly body: unknown } | undefined;
  set(key: string, body: unknown, savedAt: Date): void;
}

export function createLastGoodCache(id = 'cp-travel-data'): LastGoodCache {
  const storage = createMMKV({ id });
  return {
    get(key) {
      const raw = storage.getString(key);
      if (raw === undefined) return undefined;
      try {
        const parsed = JSON.parse(raw) as { savedAt?: unknown; body?: unknown };
        return typeof parsed.savedAt === 'string'
          ? { savedAt: parsed.savedAt, body: parsed.body }
          : undefined;
      } catch {
        return undefined;
      }
    },
    set(key, body, savedAt) {
      storage.set(key, JSON.stringify({ savedAt: savedAt.toISOString(), body }));
    },
  };
}

let sharedCache: LastGoodCache | undefined;

export function lastGoodCache(): LastGoodCache {
  sharedCache ??= createLastGoodCache();
  return sharedCache;
}

/** Any parser with zod's `safeParse` contract (the wire schemas in `@cp/domain`). */
export interface WireParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** How a route's parsed answer reads: missing (no data in it), or ok/stale with its seen time. */
export type Classification =
  | { readonly status: 'missing' }
  | { readonly status: 'ok'; readonly seenAt: string | null }
  | { readonly status: 'stale'; readonly seenAt: string | null; readonly reason: StaleReason };

export interface ReadThroughInput<T> {
  readonly reader: TravelDataReader | null;
  readonly cache: LastGoodCache;
  readonly path: string;
  readonly schema: WireParser<T>;
  readonly classify: (data: T) => Classification;
  readonly now?: Date;
  readonly signal?: AbortSignal;
}

function fromCache<T>(
  input: ReadThroughInput<T>,
  missing: MissingReason,
  reason: StaleReason,
): ReadState<T> {
  const saved = input.cache.get(input.path);
  const parsed = saved === undefined ? undefined : input.schema.safeParse(saved.body);
  if (saved === undefined || parsed === undefined || !parsed.success) {
    return { status: 'missing', reason: missing };
  }
  const classified = input.classify(parsed.data);
  if (classified.status === 'missing') return { status: 'missing', reason: 'no_data' };
  return {
    status: 'stale',
    data: parsed.data,
    seenAt: classified.seenAt ?? saved.savedAt,
    source: 'cache',
    reason,
  };
}

export async function readThrough<T>(input: ReadThroughInput<T>): Promise<ReadState<T>> {
  const now = input.now ?? new Date();
  if (input.reader === null) return fromCache(input, 'offline', 'offline');
  let response: ReaderResponse;
  try {
    response = await input.reader.getJson(input.path, input.signal);
  } catch {
    return fromCache(input, 'offline', 'offline');
  }
  if (response.status === 404) return { status: 'missing', reason: 'not_found' };
  if (response.status < 200 || response.status >= 300) {
    return fromCache(input, 'error', 'refresh_failed');
  }
  const parsed = input.schema.safeParse(response.body);
  if (!parsed.success) return fromCache(input, 'error', 'refresh_failed');
  input.cache.set(input.path, parsed.data, now);
  const classified = input.classify(parsed.data);
  if (classified.status === 'missing') return { status: 'missing', reason: 'no_data' };
  return classified.status === 'ok'
    ? { status: 'ok', data: parsed.data, seenAt: classified.seenAt, source: 'network' }
    : {
        status: 'stale',
        data: parsed.data,
        seenAt: classified.seenAt,
        source: 'network',
        reason: classified.reason,
      };
}
