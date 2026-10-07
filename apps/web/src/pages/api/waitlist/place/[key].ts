/* eslint-disable lingui/no-unlocalized-strings -- JSON error codes and header values, not UI copy. */
import type { APIRoute } from 'astro';

import { DEFAULT_LOCALE, exactLocale } from '../../../../lib/locale';
import { resolveDestination } from '../../../../lib/place-catalogue';

export const prerender = false;

/**
 * The place behind one destination key, as the boarding pass draws it: a catalogue city comes
 * with its local. Answered one place at a time, for the place a visitor picked; the public place
 * list (`../places/[locale].json.ts`) never names a city's local.
 */
export const GET: APIRoute = ({ params, url }) => {
  // `?lang=` is the page's language: it only decides how the place is named.
  const language = exactLocale(url.searchParams.get('lang')) ?? DEFAULT_LOCALE;
  const view = resolveDestination(params['key'] ?? '', language);
  if (view === null) {
    return new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  return new Response(JSON.stringify(view), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
};
