/**
 * The web search seam: the guide's `web_search` tool (./web-search.ts) talks to one small
 * interface, and each search API is an adapter behind it (../search: Tavily first). An adapter
 * sends the supplier blocklist the way its API takes it and maps results to `SearchHit`; the tool
 * still screens every URL in code, whatever the provider promised.
 */
export interface SearchQuery {
  readonly query: string;
  /** Results wanted; adapters clamp it to their API's range. */
  readonly maxResults: number;
  /** Bare domains (subdomains included) the provider must leave out. */
  readonly excludeDomains: readonly string[];
  /** Bare domains to search within, when a route allows only an explicit list. */
  readonly includeDomains?: readonly string[];
  /** `news` narrows to recent reporting (closures, events, strikes). */
  readonly topic: 'general' | 'news';
  /** Only pages published within this window, when set. */
  readonly timeRange?: 'day' | 'week' | 'month' | 'year';
}

export interface SearchHit {
  readonly url: string;
  readonly title: string;
  /** The query-relevant extract the provider returned (never a whole page). */
  readonly content: string;
  /** ISO date or date-time, when the provider knows it. */
  readonly publishedAt: string | null;
}

export interface SearchProvider {
  /** Stable adapter name, for logs and traces. */
  readonly name: string;
  search(query: SearchQuery, signal?: AbortSignal): Promise<readonly SearchHit[]>;
}

/** A provider failure: the tool answers `TOOL_UNAVAILABLE` and the model says it cannot check. */
export class SearchProviderError extends Error {
  readonly provider: string;
  readonly status: number | null;

  constructor(provider: string, status: number | null, message: string) {
    super(message);
    this.name = 'SearchProviderError';
    this.provider = provider;
    this.status = status;
  }
}
