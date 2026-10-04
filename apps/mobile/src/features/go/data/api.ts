/**
 * GO's two reads over HTTPS with the session headers: the route preview (the phone's position in
 * the POST body, never a URL, routed once by our api and dropped) and the existing ride quote for
 * Grab's fare. Answers are held in screen state only, never written to the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes and wire values, never copy. */
import type { RideQuoteResult } from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { GoPoint } from '../maps-handoff';
import type { RoutePreview } from '../preview-model';

export type GoOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string };

export interface GoApi {
  routePreview(request: {
    readonly from: GoPoint;
    readonly to: GoPoint;
    readonly tripId: string | null;
  }): Promise<GoOutcome<RoutePreview>>;
  rideQuote(request: {
    readonly tripId: string;
    readonly toPoi: string;
    readonly from: GoPoint;
  }): Promise<GoOutcome<RideQuoteResult>>;
}

async function call<T>(path: string, init: RequestInit): Promise<GoOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(await sessionHeaders()),
      },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
    return { kind: 'error', code: typeof code === 'string' ? code : `HTTP_${response.status}` };
  }
  return { kind: 'ok', value: body as T };
}

const point = (p: GoPoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export const deviceGoApi: GoApi = {
  routePreview: ({ from, to, tripId }) =>
    call<RoutePreview>('/v1/routes/preview', {
      method: 'POST',
      body: JSON.stringify({
        from: { lat: from.lat, lng: from.lng },
        to: { lat: to.lat, lng: to.lng },
        ...(tripId === null ? {} : { trip_id: tripId }),
      }),
    }),
  // The rides quote takes the pickup as a query (its existing contract); it stores place ids only.
  rideQuote: ({ tripId, toPoi, from }) =>
    call<RideQuoteResult>(
      `/v1/rides/quote?${new URLSearchParams({ trip_id: tripId, to_poi: toPoi, from: point(from) })}`,
      { method: 'GET' },
    ),
};
