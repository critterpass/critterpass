/**
 * Tavily search adapter (https://docs.tavily.com/documentation/api-reference/endpoint/search):
 * `POST /search` with a bearer key, basic depth (one credit per search), query-focused extracts
 * only (no generated answer, no raw pages, no images) and the supplier blocklist as
 * `exclude_domains`. The origin is pinned; only the key comes from the environment.
 */
import { z } from 'zod';

import { SearchProviderError, type SearchHit, type SearchProvider } from '../tools/search-provider';

export const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
/** Tavily's documented limits. */
export const TAVILY_MAX_RESULTS = 20;
export const TAVILY_MAX_EXCLUDED_DOMAINS = 150;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface TavilyOptions {
  readonly apiKey: string;
  readonly timeoutMs?: number;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
}

const responseSchema = z.object({
  results: z.array(
    z.object({
      url: z.string(),
      title: z.string().nullish(),
      content: z.string().nullish(),
      published_date: z.string().nullish(),
    }),
  ),
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createTavilySearch(options: TavilyOptions): SearchProvider {
  const send = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'tavily',
    async search(query, signal) {
      if (query.excludeDomains.length > TAVILY_MAX_EXCLUDED_DOMAINS) {
        throw new SearchProviderError('tavily', null, 'too many excluded domains');
      }
      const body = {
        query: query.query,
        search_depth: 'basic',
        topic: query.topic,
        max_results: clamp(query.maxResults, 1, TAVILY_MAX_RESULTS),
        exclude_domains: [...query.excludeDomains],
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_published_date: true,
        ...(query.timeRange === undefined ? {} : { time_range: query.timeRange }),
      };
      const timeout = AbortSignal.timeout(timeoutMs);
      let response: Response;
      try {
        response = await send(TAVILY_SEARCH_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.name : 'network error';
        throw new SearchProviderError('tavily', null, `search request failed: ${reason}`);
      }
      if (!response.ok) {
        throw new SearchProviderError(
          'tavily',
          response.status,
          `search failed with ${response.status}`,
        );
      }
      const parsed = responseSchema.safeParse(await response.json().catch(() => undefined));
      if (!parsed.success)
        throw new SearchProviderError('tavily', response.status, 'unreadable search response');
      return parsed.data.results.map((result): SearchHit => ({
        url: result.url,
        title: result.title ?? '',
        content: result.content ?? '',
        publishedAt: result.published_date ?? null,
      }));
    },
  };
}
