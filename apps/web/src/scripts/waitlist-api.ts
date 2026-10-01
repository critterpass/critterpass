/* eslint-disable lingui/no-unlocalized-strings -- API paths/HTTP header values, not JSX/UI copy. */
/** Thin fetch wrappers for the three waitlist endpoints (`src/pages/api/waitlist/**`). */
import type { DestinationView } from '../lib/destination-view';
import type { PlaceRow } from '../lib/place-search';

export interface StatsResponse {
  readonly count: number;
  readonly waveLeft: number;
  readonly wavePercent: number;
}

export interface JoinResponse {
  readonly handle: string;
  readonly position: number;
  readonly destination: string;
  readonly place: DestinationView;
}

export interface HandleResponse extends JoinResponse {
  readonly friendsJoined: number;
}

export async function fetchStats(): Promise<StatsResponse | null> {
  try {
    const response = await fetch('/api/waitlist/stats');
    if (!response.ok) return null;
    return (await response.json()) as StatsResponse;
  } catch {
    return null;
  }
}

/** The page's language, sent along so the server names the place the way the page does. */
function pageLanguage(): string {
  return document.documentElement.lang || 'en';
}

export async function fetchHandle(handle: string): Promise<HandleResponse | null> {
  try {
    const response = await fetch(
      `/api/waitlist/handle/${encodeURIComponent(handle)}?lang=${encodeURIComponent(pageLanguage())}`,
    );
    if (!response.ok) return null;
    return (await response.json()) as HandleResponse;
  } catch {
    return null;
  }
}

export type JoinOutcome =
  | { readonly ok: true; readonly data: JoinResponse }
  | { readonly ok: false; readonly status: number };

export async function joinWaitlist(input: {
  email: string;
  destination: string;
  referredBy: string | null;
  company: string;
}): Promise<JoinOutcome> {
  try {
    const response = await fetch('/api/waitlist/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...input, locale: pageLanguage() }),
    });
    if (!response.ok) return { ok: false, status: response.status };
    const data = (await response.json()) as JoinResponse;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** The bundled place list, fetched the first time a visitor reaches for the search field. */
export async function fetchPlaces(): Promise<readonly PlaceRow[] | null> {
  try {
    const response = await fetch(`/api/waitlist/places/${encodeURIComponent(pageLanguage())}.json`);
    if (!response.ok) return null;
    return (await response.json()) as PlaceRow[];
  } catch {
    return null;
  }
}
