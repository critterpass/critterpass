/**
 * Web research for the factory, on our own search tool's provider (Tavily). Queries carry places,
 * dates and topics only. Supplier sites are excluded, and so are Google Maps and TripAdvisor, so
 * facts come from official, tourism and reference pages. Results are cached by query, so a re-run
 * searches nothing new; with `CONTENT_FACTORY_RECORD` set the responses are also recorded.
 */
import path from 'node:path';

import {
  screenSearchQuery,
  searchProviderFromEnv,
  SUPPLIER_BLOCKED_DOMAINS,
  type SearchHit,
  type SearchProvider,
} from '@cp/ai';
import { sha256Hex } from '@cp/content';

import { recordingFetch } from './record';
import { FACTORY_DIR, readJsonIfExists, writeJson } from './work';

export const RESEARCH_EXCLUDED_DOMAINS = [
  ...SUPPLIER_BLOCKED_DOMAINS,
  'maps.google.com',
  'google.com',
  'tripadvisor.com',
  'tripadvisor.co.uk',
  // Social posts are not sources a reviewer can check a date against.
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'x.com',
  'reddit.com',
  'youtube.com',
];

export interface ResearchHit {
  readonly url: string;
  readonly title: string;
  readonly content: string;
}

export function searchFromEnv(
  env: Record<string, string | undefined> = process.env,
): SearchProvider | null {
  const record = env['CONTENT_FACTORY_RECORD'];
  return searchProviderFromEnv(env, record ? { fetch: recordingFetch(record) } : {}) ?? null;
}

/** Cached search: returns the cached hits, or searches when a provider is given. */
export async function research(
  provider: SearchProvider | null,
  query: string,
  options: { maxResults?: number; cacheDir?: string } = {},
): Promise<readonly ResearchHit[]> {
  const screened = screenSearchQuery(query);
  const file = path.join(
    options.cacheDir ?? path.join(FACTORY_DIR, 'work', 'search-cache'),
    `${sha256Hex(screened).slice(0, 32)}.json`,
  );
  const cached = readJsonIfExists<ResearchHit[]>(file);
  if (cached !== undefined) return cached;
  if (provider === null) throw new Error(`search needed for "${screened}": set TAVILY_API_KEY`);
  const hits: readonly SearchHit[] = await provider.search({
    query: screened,
    maxResults: options.maxResults ?? 4,
    excludeDomains: RESEARCH_EXCLUDED_DOMAINS,
    topic: 'general',
  });
  const trimmed = hits.map((hit) => ({
    url: hit.url,
    title: hit.title,
    content: hit.content.slice(0, 600),
  }));
  writeJson(file, trimmed);
  return trimmed;
}
