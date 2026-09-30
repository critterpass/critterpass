/**
 * The Viator adapter (Full + Booking access; Viator is the merchant of record): product search,
 * cart hold with Viator's hosted payment form (`VIATOR_FORM`), cart booking with the form's payment
 * token, booking status, modified-since, cancel quote and cancel. It runs only while the
 * `viator_booking` partner switch is on; until then Viator affiliate links are the path.
 */
import type {
  BookRequest,
  HoldRequest,
  OfferQuery,
  SupplierAdapter,
  SupplierOffer,
} from '../core/adapter';
import type { SupplierHttp } from '../core/http';
import {
  VIATOR_BOOK_TIMEOUT_MS,
  viatorCall,
  type ViatorConfig,
  type ViatorTransport,
} from './client';
import {
  bookingStatusResponseSchema,
  cancelQuoteResponseSchema,
  cancelResponseSchema,
  cartBookResponseSchema,
  cartHoldResponseSchema,
  mapBook,
  mapCancel,
  mapCancelQuote,
  mapHold,
  mapModifiedSince,
  mapOffers,
  mapStatus,
  modifiedSinceResponseSchema,
  productSearchResponseSchema,
} from './mappers';
import { createRollingLimiter, type RollingLimiter } from './rate-limit';

/** Viator caps a cart at 16 items. */
export const VIATOR_MAX_CART_ITEMS = 16;
/** Partner flag in `ops.partner_adapters`. */
export const VIATOR_PARTNER_KEY = 'viator_booking';

export interface ViatorAdapterOptions {
  readonly http: SupplierHttp;
  readonly config: ViatorConfig;
  readonly limiter?: RollingLimiter;
  readonly now?: () => Date;
}

export interface ViatorAdapter extends SupplierAdapter {
  search(query: OfferQuery): Promise<readonly SupplierOffer[]>;
  hold: NonNullable<SupplierAdapter['hold']>;
  book: NonNullable<SupplierAdapter['book']>;
  cancelQuote: NonNullable<SupplierAdapter['cancelQuote']>;
  cancel: NonNullable<SupplierAdapter['cancel']>;
  status: NonNullable<SupplierAdapter['status']>;
  pollModifiedSince: NonNullable<SupplierAdapter['pollModifiedSince']>;
}

function holdBody(request: HoldRequest, hostingUrl: string) {
  if (request.items.length === 0 || request.items.length > VIATOR_MAX_CART_ITEMS) {
    throw new RangeError(`a Viator cart holds 1 to ${VIATOR_MAX_CART_ITEMS} items`);
  }
  return {
    partnerCartRef: request.cartRef,
    currency: request.currency,
    items: request.items.map((item) => ({
      partnerBookingRef: item.itemRef,
      productCode: item.productCode,
      ...(item.optionCode === undefined ? {} : { productOptionCode: item.optionCode }),
      ...(item.startTime === undefined ? {} : { startTime: item.startTime }),
      travelDate: item.travelDate,
      paxMix: item.pax.map((band) => ({ ageBand: band.ageBand, numberOfTravelers: band.count })),
    })),
    paymentDataSubmissionMode: 'VIATOR_FORM',
    hostingUrl,
  };
}

function bookBody(request: BookRequest) {
  return {
    cartRef: request.holdRef,
    paymentToken: request.paymentToken,
    bookerInfo: request.booker,
    communication: request.communication,
    items: request.items.map((item) => ({
      bookingRef: item.bookingRef,
      ...(item.answers.length === 0 ? {} : { bookingQuestionAnswers: item.answers }),
    })),
  };
}

export function createViatorAdapter(options: ViatorAdapterOptions): ViatorAdapter {
  const transport: ViatorTransport = {
    http: options.http,
    config: options.config,
    limiter: options.limiter ?? createRollingLimiter(),
  };
  const now = options.now ?? (() => new Date());
  return {
    id: 'viator',
    flag: VIATOR_PARTNER_KEY,
    capabilities: {
      search: true,
      deepLink: true,
      hold: true,
      book: true,
      cancel: true,
      status: true,
    },
    async search(query) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'products_search',
          method: 'POST',
          path: '/products/search',
          body: {
            filtering: { destination: query.destinationRef, startDate: query.date },
            pagination: { start: 1, count: Math.min(query.limit ?? 10, 50) },
            currency: query.currency,
          },
        },
        productSearchResponseSchema,
      );
      return mapOffers(body, now().toISOString());
    },
    async hold(request) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'cart_hold',
          method: 'POST',
          path: '/bookings/cart/hold',
          body: holdBody(request, options.config.hostingUrl),
        },
        cartHoldResponseSchema,
      );
      return mapHold(body);
    },
    async book(request) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'cart_book',
          method: 'POST',
          path: '/bookings/cart/book',
          body: bookBody(request),
          timeoutMs: VIATOR_BOOK_TIMEOUT_MS,
        },
        cartBookResponseSchema,
      );
      return mapBook(body);
    },
    async status(bookingRef) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'booking_status',
          method: 'POST',
          path: '/bookings/status',
          body: { bookingRef },
        },
        bookingStatusResponseSchema,
      );
      return mapStatus(body);
    },
    async pollModifiedSince(cursor) {
      // A cursor from a previous page, or an ISO timestamp to start from.
      const query = /^\d{4}-\d{2}-\d{2}T/.test(cursor) ? { 'modified-since': cursor } : { cursor };
      const body = await viatorCall(
        transport,
        {
          endpoint: 'bookings_modified_since',
          method: 'GET',
          path: '/bookings/modified-since',
          query,
        },
        modifiedSinceResponseSchema,
      );
      return mapModifiedSince(body);
    },
    async cancelQuote(bookingRef) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'cancel_quote',
          method: 'GET',
          path: `/bookings/${encodeURIComponent(bookingRef)}/cancel-quote`,
        },
        cancelQuoteResponseSchema,
      );
      return mapCancelQuote(body);
    },
    async cancel(bookingRef, reasonCode) {
      const body = await viatorCall(
        transport,
        {
          endpoint: 'cancel',
          method: 'POST',
          path: `/bookings/${encodeURIComponent(bookingRef)}/cancel`,
          body: { reasonCode },
        },
        cancelResponseSchema,
      );
      return mapCancel(body);
    },
  };
}
