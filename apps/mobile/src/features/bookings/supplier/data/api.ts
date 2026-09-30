/**
 * The supplier reads the app makes over HTTPS with the session headers. Supplier content (offers)
 * is fetched per view and held only in screen state: never cached, never written to the phone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- routes and wire values, never copy. */
import type { ActivityCancelQuote, RideQuoteResult, VendorThreadView } from '@cp/domain';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { HttpOutcome } from '../../data/services';

/** One Viator product as the api relays it, verbatim. */
export interface WireOffer {
  readonly supplier: string;
  readonly productCode: string;
  readonly title: string;
  readonly description: string | null;
  readonly priceFrom: { readonly amount: number; readonly currency: string } | null;
  readonly holdSupported: boolean;
  readonly productUrl: string | null;
  readonly seenAt: string;
}

export interface OffersQuery {
  readonly tripId: string;
  readonly destinationRef: string;
  readonly date: string;
  readonly currency: string;
}

export interface PaymentSession {
  readonly hold_id: string;
  readonly payment_session_token: string;
  readonly hold_valid_until: string | null;
}

export interface RideQuoteRequest {
  readonly tripId: string;
  readonly toPoi: string;
  readonly fromPoi?: string | undefined;
  readonly from?: { readonly lat: number; readonly lng: number } | undefined;
}

export interface SupplierApi {
  offers(query: OffersQuery): Promise<HttpOutcome<readonly WireOffer[]>>;
  paymentSession(holdId: string): Promise<HttpOutcome<PaymentSession>>;
  cancelQuote(bookingId: string): Promise<HttpOutcome<ActivityCancelQuote>>;
  rideQuote(request: RideQuoteRequest): Promise<HttpOutcome<RideQuoteResult>>;
  /** Driving minutes between two points (a routed estimate, or a straight-line one). */
  driveMinutes(
    from: { readonly lat: number; readonly lng: number },
    to: { readonly lat: number; readonly lng: number },
  ): Promise<HttpOutcome<number>>;
  vendorThreads(tripId: string): Promise<HttpOutcome<readonly VendorThreadView[]>>;
}

function codeOf(body: unknown, status: number): string {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' ? code : `HTTP_${String(status)}`;
}

async function getJson<T>(path: string): Promise<HttpOutcome<T>> {
  let response: Response;
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      headers: { accept: 'application/json', ...(await sessionHeaders()) },
    });
  } catch {
    return { kind: 'offline' };
  }
  const body = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) return { kind: 'error', code: codeOf(body, response.status) };
  return { kind: 'ok', value: body as T };
}

function map<T, U>(outcome: HttpOutcome<T>, pick: (value: T) => U): HttpOutcome<U> {
  return outcome.kind === 'ok' ? { kind: 'ok', value: pick(outcome.value) } : outcome;
}

const point = (p: { readonly lat: number; readonly lng: number }) =>
  `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export const deviceSupplierApi: SupplierApi = {
  offers: async (query) => {
    const params = new URLSearchParams({
      trip_id: query.tripId,
      destination_ref: query.destinationRef,
      date: query.date,
      currency: query.currency,
    });
    const outcome = await getJson<{ offers: WireOffer[] }>(`/v1/suppliers/offers?${params}`);
    return map(outcome, (body) => body.offers);
  },
  paymentSession: (holdId) =>
    getJson<PaymentSession>(`/v1/suppliers/payment-session/${encodeURIComponent(holdId)}`),
  cancelQuote: (bookingId) =>
    getJson<ActivityCancelQuote>(
      `/v1/suppliers/bookings/${encodeURIComponent(bookingId)}/cancel-quote`,
    ),
  rideQuote: (request) => {
    const params = new URLSearchParams({ trip_id: request.tripId, to_poi: request.toPoi });
    if (request.fromPoi !== undefined) params.set('from_poi', request.fromPoi);
    else if (request.from !== undefined) params.set('from', point(request.from));
    return getJson<RideQuoteResult>(`/v1/rides/quote?${params}`);
  },
  driveMinutes: async (from, to) => {
    const params = new URLSearchParams({ from: point(from), to: point(to), mode: 'drive' });
    const outcome = await getJson<{ minutes: number }>(`/v1/routes/eta?${params}`);
    return map(outcome, (body) => body.minutes);
  },
  vendorThreads: async (tripId) => {
    const outcome = await getJson<{ threads: VendorThreadView[] }>(
      `/v1/trips/${encodeURIComponent(tripId)}/vendor-threads`,
    );
    return map(outcome, (body) => body.threads);
  },
};
