/* eslint-disable lingui/no-unlocalized-strings -- JSON error codes and header values, not UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { DEFAULT_LOCALE, exactLocale } from '../../../lib/locale';
import { searchCatalogue } from '../../../lib/place-catalogue';
import { foldPlaceText, isSearchable } from '../../../lib/place-search';
import {
  SEARCH_IP_HASH_SALT,
  SEARCH_RATE_LIMIT_MAX_REQUESTS,
  decideRateLimit,
  hashIp,
} from '../../../lib/rate-limit';
import { readRateLimit, writeRateLimit } from '../../../lib/waitlist-repository';

export const prerender = false;

const MAX_QUERY_LENGTH = 64;

function jsonResponse(body: unknown, status: number, cacheControl = 'no-store'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': cacheControl },
  });
}

/**
 * "Somewhere else?": the few places that match what a visitor typed, by city name or by the name
 * of the critter that lives there, each row with that city's critter. The place list itself is
 * never sent: at least two letters, at most eight rows, no listing and no paging. An answer is
 * cached per folded query and language; only answers the cache does not have count against the
 * caller's allowance.
 */
export const GET: APIRoute = async ({ url, clientAddress }) => {
  const raw = url.searchParams.get('q') ?? '';
  if (raw.length > MAX_QUERY_LENGTH || !isSearchable(raw)) {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }
  // `?lang=` is the page's language: it decides how places are named and found.
  const language = exactLocale(url.searchParams.get('lang')) ?? DEFAULT_LOCALE;
  const query = foldPlaceText(raw);

  const cacheKey = new URL('/api/waitlist/search', url);
  cacheKey.searchParams.set('q', query);
  cacheKey.searchParams.set('lang', language);
  const cache = caches.default;
  const cached = await cache.match(cacheKey.href);
  if (cached !== undefined) return cached;

  const ipHash = await hashIp(clientAddress ?? 'unknown', SEARCH_IP_HASH_SALT);
  const decision = decideRateLimit(
    await readRateLimit(env.DB, ipHash),
    Date.now(),
    SEARCH_RATE_LIMIT_MAX_REQUESTS,
  );
  await writeRateLimit(env.DB, ipHash, decision.next);
  if (decision.limited) return jsonResponse({ error: 'rate_limited' }, 429);

  const response = jsonResponse(searchCatalogue(query, language), 200, 'public, max-age=3600');
  await cache.put(cacheKey.href, response.clone());
  return response;
};
