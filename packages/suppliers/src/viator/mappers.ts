/**
 * Viator Partner API v2 response shapes (only the fields we read; everything else passes) and
 * their mapping onto the adapter contract. The traveller pays `partnerTotalPrice` in Viator's own
 * payment form (Viator is the merchant of record); we only read it back.
 */
import { z } from 'zod';

import type {
  BookingStatus,
  BookResult,
  CancelQuote,
  CancelResult,
  HoldItemResult,
  HoldResult,
  HoldStatus,
  ModifiedSincePage,
  SupplierBookingState,
  SupplierMoney,
  SupplierOffer,
} from '../core/adapter';

const priceSchema = z.object({
  recommendedRetailPrice: z.number().nonnegative(),
  partnerTotalPrice: z.number().nonnegative().optional(),
});
const pricedSchema = z.object({ price: priceSchema }).loose();

const holdStatusSchema = z.enum(['HOLDING', 'HOLD_NOT_PROVIDED']);
const holdPartSchema = z.object({ status: holdStatusSchema, validUntil: z.string().optional() });

const voucherSchema = z.object({ url: z.string(), format: z.string() }).loose();

export const cartHoldResponseSchema = z
  .object({
    cartRef: z.string(),
    partnerCartRef: z.string(),
    currency: z.string(),
    items: z.array(
      z
        .object({
          partnerBookingRef: z.string(),
          bookingRef: z.string(),
          status: z.enum(['BOOKABLE', 'REJECTED']),
          rejectionReasonCode: z.string().optional(),
          itemTotalPrice: pricedSchema.optional(),
          bookingHoldInfo: z
            .object({ availability: holdPartSchema, pricing: holdPartSchema })
            .optional(),
        })
        .loose(),
    ),
    totalHeldPrice: pricedSchema,
    paymentSessionToken: z.string().optional(),
  })
  .loose();

const bookedItemSchema = z
  .object({
    partnerBookingRef: z.string(),
    bookingRef: z.string(),
    status: z.enum(['CONFIRMED', 'PENDING', 'REJECTED']),
    rejectionReasonCode: z.string().optional(),
    itemTotalPrice: pricedSchema.optional(),
    voucherInfo: voucherSchema.optional(),
  })
  .loose();

export const cartBookResponseSchema = z
  .object({
    cartRef: z.string(),
    currency: z.string(),
    items: z.array(bookedItemSchema),
    voucherInfo: voucherSchema.optional(),
  })
  .loose();

export const bookingStatusResponseSchema = z
  .object({
    status: z.enum([
      'CONFIRMED',
      'PENDING',
      'REJECTED',
      'CANCELED',
      'IN_PROGRESS',
      'ON_HOLD',
      'FAILED',
    ]),
    bookingRef: z.string(),
    partnerBookingRef: z.string().optional(),
    currency: z.string().optional(),
    totalPrice: pricedSchema.optional(),
    voucherInfo: voucherSchema.optional(),
    rejectionReasonCode: z.string().optional(),
    nextPollAt: z.string().optional(),
  })
  .loose();

export const cancelQuoteResponseSchema = z
  .object({
    bookingId: z.string(),
    status: z.enum(['CANCELLABLE', 'CANCELLED', 'NOT_CANCELLABLE']),
    refundDetails: z
      .object({
        refundAmount: z.number().nonnegative(),
        refundPercentage: z.number(),
        currencyCode: z.string(),
      })
      .loose()
      .optional(),
  })
  .loose();

export const cancelResponseSchema = z
  .object({
    bookingId: z.string(),
    status: z.enum(['ACCEPTED', 'DECLINED']),
    reason: z.string().optional(),
  })
  .loose();

export const modifiedSinceResponseSchema = z
  .object({
    bookings: z.array(
      z
        .object({
          eventType: z.string(),
          bookingRef: z.string(),
          partnerBookingRef: z.string().optional(),
        })
        .loose(),
    ),
    nextCursor: z.string().optional(),
  })
  .loose();

export const productSearchResponseSchema = z
  .object({
    products: z.array(
      z
        .object({
          productCode: z.string(),
          title: z.string(),
          description: z.string().optional(),
          productUrl: z.string().optional(),
          pricing: z
            .object({
              summary: z.object({ fromPrice: z.number().nonnegative() }).loose(),
              currency: z.string(),
            })
            .loose()
            .optional(),
        })
        .loose(),
    ),
    totalCount: z.number().int().nonnegative(),
  })
  .loose();

function money(priced: z.infer<typeof pricedSchema> | undefined, currency: string) {
  if (priced === undefined) return null;
  const amount = priced.price.partnerTotalPrice ?? priced.price.recommendedRetailPrice;
  return { amount, currency } satisfies SupplierMoney;
}

function earliest(values: readonly (string | undefined)[]): string | undefined {
  const times = values.filter((v): v is string => v !== undefined).sort();
  return times[0];
}

/** Held until the earliest item deadline, and only when every bookable item holds that part. */
function heldUntil(
  items: readonly HoldItemResult[],
  part: 'availability' | 'pricing',
): string | undefined {
  const bookable = items.filter((item) => item.bookable);
  if (bookable.length === 0) return undefined;
  const status = (item: HoldItemResult): HoldStatus | null => item[part];
  const until = (item: HoldItemResult) =>
    part === 'availability' ? item.availabilityUntil : item.pricingUntil;
  if (!bookable.every((item) => status(item) === 'HOLDING' && until(item) !== null)) {
    return undefined;
  }
  return earliest(bookable.map((item) => until(item) ?? undefined));
}

export function mapHold(body: z.infer<typeof cartHoldResponseSchema>): HoldResult {
  const items: HoldItemResult[] = body.items.map((item) => ({
    itemRef: item.partnerBookingRef,
    bookingRef: item.bookingRef,
    bookable: item.status === 'BOOKABLE',
    rejectionCode: item.rejectionReasonCode ?? null,
    availability: item.bookingHoldInfo?.availability.status ?? null,
    availabilityUntil: item.bookingHoldInfo?.availability.validUntil ?? null,
    pricing: item.bookingHoldInfo?.pricing.status ?? null,
    pricingUntil: item.bookingHoldInfo?.pricing.validUntil ?? null,
    total: money(item.itemTotalPrice, body.currency),
  }));
  const seatsHeldUntil = heldUntil(items, 'availability');
  const priceHeldUntil = heldUntil(items, 'pricing');
  return {
    holdRef: body.cartRef,
    ...(seatsHeldUntil === undefined ? {} : { seatsHeldUntil }),
    ...(priceHeldUntil === undefined ? {} : { priceHeldUntil }),
    holdProvided: seatsHeldUntil !== undefined,
    items,
    total: money(body.totalHeldPrice, body.currency) ?? { amount: 0, currency: body.currency },
    paymentSessionToken: body.paymentSessionToken ?? null,
  };
}

const STATUS_STATES: Readonly<Record<string, SupplierBookingState>> = {
  CONFIRMED: 'confirmed',
  PENDING: 'pending',
  IN_PROGRESS: 'pending',
  ON_HOLD: 'pending',
  REJECTED: 'rejected',
  CANCELED: 'cancelled',
  FAILED: 'failed',
};

export function mapBook(body: z.infer<typeof cartBookResponseSchema>): BookResult {
  const items: BookingStatus[] = body.items.map((item) => ({
    bookingRef: item.bookingRef,
    itemRef: item.partnerBookingRef,
    status: STATUS_STATES[item.status] ?? 'pending',
    rejectionCode: item.rejectionReasonCode ?? null,
    voucher: item.voucherInfo ?? body.voucherInfo ?? null,
    total: money(item.itemTotalPrice, body.currency),
    nextPollAt: null,
  }));
  const states = new Set(items.map((item) => item.status));
  const status = states.has('pending')
    ? 'pending'
    : states.has('confirmed')
      ? 'confirmed'
      : 'rejected';
  const voucher = body.voucherInfo ?? items.find((item) => item.voucher !== null)?.voucher;
  return {
    status,
    bookingRef: body.cartRef,
    ...(voucher === undefined || voucher === null ? {} : { voucher }),
    items,
  };
}

export function mapStatus(body: z.infer<typeof bookingStatusResponseSchema>): BookingStatus {
  return {
    bookingRef: body.bookingRef,
    itemRef: body.partnerBookingRef ?? null,
    status: STATUS_STATES[body.status] ?? 'pending',
    rejectionCode: body.rejectionReasonCode ?? null,
    voucher: body.voucherInfo ?? null,
    total: money(body.totalPrice, body.currency ?? 'USD'),
    nextPollAt: body.nextPollAt ?? null,
  };
}

export function mapCancelQuote(body: z.infer<typeof cancelQuoteResponseSchema>): CancelQuote {
  return {
    cancellable: body.status === 'CANCELLABLE',
    refund:
      body.refundDetails === undefined
        ? null
        : { amount: body.refundDetails.refundAmount, currency: body.refundDetails.currencyCode },
    refundPercentage: body.refundDetails?.refundPercentage ?? null,
  };
}

export function mapCancel(body: z.infer<typeof cancelResponseSchema>): CancelResult {
  return {
    status: body.status === 'ACCEPTED' ? 'cancelled' : 'rejected',
    reason: body.reason ?? null,
  };
}

const EVENT_STATES: Readonly<Record<string, SupplierBookingState>> = {
  CONFIRMATION: 'confirmed',
  REJECTION: 'rejected',
  CANCELLATION: 'cancelled',
};

/** Amendments change details, not the order's state: they are left to the status read. */
export function mapModifiedSince(
  body: z.infer<typeof modifiedSinceResponseSchema>,
): ModifiedSincePage {
  const changes: BookingStatus[] = body.bookings.flatMap((event) => {
    const status = EVENT_STATES[event.eventType];
    if (status === undefined) return [];
    return [
      {
        bookingRef: event.bookingRef,
        itemRef: event.partnerBookingRef ?? null,
        status,
        rejectionCode: null,
        voucher: null,
        total: null,
        nextPollAt: null,
      },
    ];
  });
  return { changes, next: body.nextCursor ?? null };
}

export function mapOffers(
  body: z.infer<typeof productSearchResponseSchema>,
  seenAt: string,
): SupplierOffer[] {
  return body.products.map((product) => ({
    supplier: 'viator',
    productCode: product.productCode,
    title: product.title,
    description: product.description ?? null,
    priceFrom:
      product.pricing === undefined
        ? null
        : { amount: product.pricing.summary.fromPrice, currency: product.pricing.currency },
    // Whether seats can be held is only known from a hold; search never claims it.
    holdSupported: false,
    productUrl: product.productUrl ?? null,
    seenAt,
  }));
}
