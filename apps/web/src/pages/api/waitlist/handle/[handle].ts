/* eslint-disable lingui/no-unlocalized-strings -- JSON error codes/keys, not JSX/UI copy. */
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import {
  countReferrals,
  findEntryByHandle,
  rankOfEntry,
} from '../../../../lib/waitlist-repository';
import { guideView } from '../../../../lib/destination-view';
import { DEFAULT_LOCALE, exactLocale } from '../../../../lib/locale';
import { chipPlaces, resolveDestination } from '../../../../lib/place-catalogue';
import { DEFAULT_DESTINATION, positionInLine } from '../../../../lib/waitlist';

export const prerender = false;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Position + friends-joined for a returning visitor's stored handle. Never returns an email. */
export const GET: APIRoute = async ({ params, url }) => {
  const handle = params['handle'];
  if (typeof handle !== 'string' || handle.length === 0) {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  const db = env.DB;
  const entry = await findEntryByHandle(db, handle);
  if (!entry) {
    return jsonResponse({ error: 'not_found' }, 404);
  }
  // `?lang=` is the page's language: it only decides how the place is named.
  const language = exactLocale(url.searchParams.get('lang')) ?? DEFAULT_LOCALE;
  const [rank, friendsJoined] = await Promise.all([
    rankOfEntry(db, entry.id),
    countReferrals(db, entry.handle),
  ]);
  return jsonResponse(
    {
      handle: entry.handle,
      destination: entry.destination,
      place:
        resolveDestination(entry.destination, language) ??
        guideView(
          DEFAULT_DESTINATION.key,
          chipPlaces(language)[DEFAULT_DESTINATION.key] ?? '',
          language,
        ),
      position: positionInLine(rank, friendsJoined),
      friendsJoined,
    },
    200,
  );
};
