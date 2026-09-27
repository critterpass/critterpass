/**
 * Anthropic's server-side web search, offered only where the contract allows it (guest guide,
 * events and closures: callers C and R) and only on Sonnet routes that switch it on. Every request
 * carries the supplier blocklist; `allowed_domains` is never set because the API rejects the two
 * together. Search runs as a direct call (no dynamic filtering) so every result block comes back
 * where code can see it: `screenWebSearch` checks each result and citation URL against the same
 * list, and `dropBlockedCitations` removes any blocked citation before an answer reaches a client.
 * Result blocks themselves are passed back to the API unchanged (their encrypted content must
 * round-trip byte for byte).
 */
import type Anthropic from '@anthropic-ai/sdk';

import { GatewayConfigError } from '../errors';
import type { RouteConfig } from '../routing';
import { isServerToolAllowed } from './allow-lists';
import { isBlockedUrl, SUPPLIER_BLOCKED_DOMAINS } from './blocked-domains';
import { customToolDefinitions } from './registry';

export const WEB_SEARCH_TOOL_TYPE = 'web_search_20260209';
/** Searches per request; a guest-guide answer needs one to three. */
export const WEB_SEARCH_MAX_USES = 3;

export interface WebSearchOptions {
  readonly userLocation?: Anthropic.Messages.UserLocation;
}

export function webSearchTool(
  route: RouteConfig,
  options: WebSearchOptions = {},
): Anthropic.Messages.WebSearchTool20260209 {
  if (
    !route.webSearch ||
    route.tier !== 'sonnet' ||
    !isServerToolAllowed(route.caller, 'web_search')
  ) {
    throw new GatewayConfigError(`route ${route.route} may not use web search`);
  }
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    blocked_domains: [...SUPPLIER_BLOCKED_DOMAINS],
    max_uses: WEB_SEARCH_MAX_USES,
    allowed_callers: ['direct'],
    ...(options.userLocation === undefined ? {} : { user_location: options.userLocation }),
  };
}

/** Every tool a route is offered: its allow-listed client tools, then web search where enabled. */
export function routeTools(
  route: RouteConfig,
  options: WebSearchOptions = {},
): Anthropic.Messages.ToolUnion[] {
  const tools: Anthropic.Messages.ToolUnion[] = customToolDefinitions(route);
  if (route.webSearch) tools.push(webSearchTool(route, options));
  return tools;
}

export interface WebSearchScreen {
  /** Result and citation URLs the search returned. */
  readonly urls: readonly string[];
  /** The subset on a blocked supplier domain; non-empty means the provider-side block leaked. */
  readonly blocked: readonly string[];
}

function citationUrls(block: Anthropic.Messages.TextBlock): string[] {
  return (block.citations ?? []).flatMap((citation) =>
    citation.type === 'web_search_result_location' ? [citation.url] : [],
  );
}

export function screenWebSearch(
  content: readonly Anthropic.Messages.ContentBlock[],
): WebSearchScreen {
  const urls: string[] = [];
  for (const block of content) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const result of block.content) urls.push(result.url);
    }
    if (block.type === 'text') urls.push(...citationUrls(block));
  }
  const unique = [...new Set(urls)];
  return { urls: unique, blocked: unique.filter((url) => isBlockedUrl(url)) };
}

/** Text blocks with every citation to a blocked domain removed (what a client may be shown). */
export function dropBlockedCitations(
  content: readonly Anthropic.Messages.ContentBlock[],
): Anthropic.Messages.ContentBlock[] {
  return content.map((block) => {
    if (block.type !== 'text' || block.citations === null) return block;
    return {
      ...block,
      citations: block.citations.filter(
        (citation) => citation.type !== 'web_search_result_location' || !isBlockedUrl(citation.url),
      ),
    };
  });
}

/** Distinct cited URLs a client may show, blocked domains removed. */
export function citedSources(content: readonly Anthropic.Messages.ContentBlock[]): string[] {
  const urls = dropBlockedCitations(content).flatMap((block) =>
    block.type === 'text' ? citationUrls(block) : [],
  );
  return [...new Set(urls)];
}

/** The answer as a client would see it: text plus the source URLs it cites. */
export function visibleAnswer(content: readonly Anthropic.Messages.ContentBlock[]): string {
  const text = content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  const sources = citedSources(content);
  return sources.length === 0 ? text : `${text}\n\nSources: ${sources.join(', ')}`;
}
