/**
 * The one hook every travel-data read goes through: a synced local answer first when the caller
 * has one (trip pack rows), else the api through `readThrough` with the last good copy as the
 * offline fallback. Re-reads whenever `path` changes; stale answers are kept on screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer (docs/system-architecture.md
   §3); every literal is a route path, query key or wire value, never copy. */
import { useEffect, useState } from 'react';

import {
  lastGoodCache,
  readThrough,
  useTravelDataReader,
  type Classification,
  type LastGoodCache,
  type WireParser,
} from './client';
import type { ReadState } from './freshness';

export interface UseTravelReadOptions<T> {
  /** Null when the caller lacks what the route needs; the state is then `missing`. */
  readonly path: string | null;
  readonly schema: WireParser<T>;
  readonly classify: (data: T) => Classification;
  /** A synced local answer; `null` falls through to the api. */
  readonly local?: () => Promise<ReadState<T> | null>;
  readonly cache?: LastGoodCache;
  readonly now?: () => Date;
}

const NO_PATH = { status: 'missing', reason: 'no_data' } as const;

export function useTravelRead<T>(options: UseTravelReadOptions<T>): ReadState<T> {
  const reader = useTravelDataReader();
  // Each answer is kept with the path it answers, so a new path reads as loading until it lands.
  const [answer, setAnswer] = useState<{ path: string; state: ReadState<T> } | null>(null);
  const { path } = options;

  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    const now = options.now?.() ?? new Date();
    void (async () => {
      const local = options.local === undefined ? null : await options.local().catch(() => null);
      const next =
        local ??
        (await readThrough({
          reader,
          cache: options.cache ?? lastGoodCache(),
          path,
          schema: options.schema,
          classify: options.classify,
          now,
          signal: controller.signal,
        }));
      if (!controller.signal.aborted) setAnswer({ path, state: next });
    })();
    return () => controller.abort();
    // The read's identity is its route + query (`path`) and the reader; the other options are
    // stable per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, reader]);

  if (path === null) return NO_PATH;
  return answer?.path === path ? answer.state : { status: 'loading' };
}

/** `?a=1&b=2` from defined values only, in the given order. */
export function query(params: Readonly<Record<string, string | number | undefined>>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text.length === 0 ? '' : `?${text}`;
}
