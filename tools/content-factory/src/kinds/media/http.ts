/**
 * Fetching from the stock sources: JSON GETs with the factory's User-Agent, cached on disk for a
 * day by the URL without its key (Pixabay asks for 24 h caching, and a re-run searches nothing
 * new). The key is only ever sent, never cached, logged or recorded.
 */
import path from 'node:path';

import { sha256Hex } from '@cp/content';

import { FACTORY_DIR, readJsonIfExists, writeJson } from '../../work';

export const USER_AGENT = 'CritterPass-content-factory/1.0 (https://critterpass.app)';
const DAY_MS = 86_400_000;

export interface SourceHttp {
  readonly fetch: typeof fetch;
  readonly cacheDir: string;
  readonly now: () => number;
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
  const response = await http.fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...options.headers },
  });
  if (!response.ok) {
    throw new Error(`${shown.host}${shown.pathname} answered HTTP ${response.status}`);
  }
  const body = (await response.json()) as T;
  writeJson(file, { at: http.now(), url: shown.toString(), body });
  return body;
}
