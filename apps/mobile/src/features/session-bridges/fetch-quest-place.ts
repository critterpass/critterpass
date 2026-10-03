/**
 * A quest place's point from `GET /v1/places/{id}`, for a place the phone has no synced copy of
 * (an auto-curated spot outside the trip pack). The location engine keeps the answer for the day;
 * a thrown error (offline, server down) leaves the place unwatched until a later retry.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a route path, header values and an error, never copy. */
import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import type { FetchedPlace } from '@/lib/location';

export async function fetchQuestPlace(poiId: string): Promise<FetchedPlace | null> {
  const response = await fetch(`${resolveApiBaseUrl()}/v1/places/${encodeURIComponent(poiId)}`, {
    headers: { accept: 'application/json', ...(await sessionHeaders()) },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`place ${poiId}: HTTP ${String(response.status)}`);
  const body = (await response.json()) as Partial<FetchedPlace>;
  const { lat, lng, category } = body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { id: poiId, lat, lng, category: typeof category === 'string' ? category : 'other' };
}
