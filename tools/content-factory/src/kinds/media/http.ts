/**
 * Fetching from the stock sources: JSON GETs with the factory's User-Agent, cached on disk for a
 * day by the URL without its key (Pixabay asks for 24 h caching, and a re-run searches nothing
 * new). A source that answers busy is asked again after the wait it names, and a dropped
 * connection is tried again. The key is only ever
 * sent, never cached, logged or recorded.
 */
import path from 'node:path';

import { sha256Hex } from '@cp/content';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

export const USER_AGENT = 'CritterPass-content-factory/1.0 (https://critterpass.app)';
const DAY_MS = 86_400_000;
const BUSY = new Set([429, 503, 504]);
const MAX_WAITS = 4;
const DEFAULT_WAIT_MS = 10_000;
const MAX_WAIT_MS = 90_000;
const DROPPED_WAIT_MS = 5_000;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface SourceHttp {
  readonly fetch: typeof fetch;
  readonly cacheDir: string;
  readonly now: () => number;
  /** Waits before asking a busy source again (the tests wait for nothing). */
  readonly wait?: (ms: number) => Promise<void>;
}

export function defaultHttp(): SourceHttp {
  return {
    fetch,
    cacheDir: path.join(FACTORY_DIR, 'work', 'media', 'source-cache'),
    now: () => Date.now(),
  };
}

/** GETs `url` (with `headers`), returning the cached body when the same request ran today. */
export async function getJson<T>(
  http: SourceHttp,
  url: URL,
  options: { readonly headers?: Record<string, string>; readonly redact?: readonly string[] } = {},
): Promise<T> {
  const shown = new URL(url);
  for (const param of options.redact ?? []) shown.searchParams.delete(param);
  const file = path.join(http.cacheDir, `${sha256Hex(shown.toString()).slice(0, 32)}.json`);
  const cached = readJsonIfExists<{ at: number; body: T }>(file);
  if (cached !== undefined && http.now() - cached.at < DAY_MS) return cached.body;
  const wait = http.wait ?? pause;
  // A dropped connection (fetch throws a TypeError) is tried again, a few seconds later.
  const request = async (): Promise<Response> => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await http.fetch(url, {
          headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...options.headers },
        });
      } catch (error) {
        if (!(error instanceof TypeError) || attempt === MAX_WAITS) throw error;
        await wait(DROPPED_WAIT_MS);
      }
    }
  };
  let response = await request();
  // A source that asks to slow down (Wikidata budgets query time per minute, Pixabay requests
  // per minute) is given the wait it names, then asked again.
  for (let attempt = 0; attempt < MAX_WAITS && BUSY.has(response.status); attempt += 1) {
    const seconds = Number(
      response.headers.get('retry-after') ?? response.headers.get('x-ratelimit-reset') ?? '',
    );
    const named = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_WAIT_MS;
    await wait(Math.min(named, MAX_WAIT_MS));
    response = await request();
  }
  if (!response.ok) {
    throw new Error(`${shown.host}${shown.pathname} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as T;
  writeJson(file, { at: http.now(), url: shown.toString(), body });
  return body;
}
