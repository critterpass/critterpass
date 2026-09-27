/**
 * Search adapters behind `SearchProvider` (../search-provider.ts). Tavily is the configured
 * provider; a second adapter (Brave) plugs in here the same way.
 */
import { aiEnvSchema } from '../../env';
import type { SearchProvider } from '../search-provider';
import { createTavilySearch, type TavilyOptions } from './tavily';

export {
  createTavilySearch,
  TAVILY_MAX_EXCLUDED_DOMAINS,
  TAVILY_MAX_RESULTS,
  TAVILY_SEARCH_URL,
} from './tavily';
export type { TavilyOptions } from './tavily';

/** The configured search provider, or `undefined` (web search then answers `TOOL_UNAVAILABLE`). */
export function searchProviderFromEnv(
  source: Record<string, string | undefined> = process.env,
  options: Omit<TavilyOptions, 'apiKey'> = {},
): SearchProvider | undefined {
  const parsed = aiEnvSchema.pick({ TAVILY_API_KEY: true }).safeParse(source);
  if (!parsed.success) throw new Error('Invalid TAVILY_API_KEY');
  const apiKey = parsed.data.TAVILY_API_KEY;
  return apiKey === undefined ? undefined : createTavilySearch({ ...options, apiKey });
}
