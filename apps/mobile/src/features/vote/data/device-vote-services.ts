/**
 * The device's vote services: the pitch stream and the guest brief over streaming `fetch`, and
 * place search, each with the signed-in session. Provided by the vote and places route layouts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- paths and header values, never copy. */
import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import { streamSse } from './sse-client';
import type { PlaceResult } from './use-destination-search';
import type { VoteServices } from './vote-services';

async function searchPlaces(q: string, signal: AbortSignal): Promise<PlaceResult[]> {
  const response = await fetch(
    `${resolveApiBaseUrl()}/v1/places?q=${encodeURIComponent(q)}&limit=15`,
    { headers: await sessionHeaders(), signal },
  );
  if (!response.ok) throw new Error('search failed');
  const body = (await response.json()) as { results?: PlaceResult[] };
  return body.results ?? [];
}

export const deviceVoteServices: VoteServices = {
  streamPitch: (body, onFrame, signal) => streamSse('/v1/pitches', body, onFrame, { signal }),
  searchPlaces,
  streamGuestBrief: (placeId, body, onFrame, signal) =>
    streamSse(`/v1/places/${encodeURIComponent(placeId)}/guest-brief`, body, onFrame, { signal }),
};
