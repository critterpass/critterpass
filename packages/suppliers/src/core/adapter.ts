/**
 * The supplier adapter contract (docs/api-contracts.md §7). Every partner implements the
 * capabilities it really has; a missing method is a capability that does not exist by design (no
 * room holds, no flight booking, no live driver). We are never the merchant of record: no method
 * takes card data, and payment happens in the supplier's own form.
 *
 * Offer content (titles, descriptions, photos, reviews) is the supplier's verbatim text: shown
 * inside supplier cards only, fetched per view, never cached, never persisted and never sent to
 * the guide. These types live here, in a server-only package `packages/ai` cannot import
 * (tools/lint/boundaries.js), so content can never reach a prompt by type.
 */

export const SUPPLIER_IDS = [
  'viator',
  'klook',
  'gyg',
  'agoda',
  'tripcom',
  'booking_cj',
  'kiwitaxi',
  'gettransfer',
  'grab',
  'gojek',
  'travelpayouts',
  'whatsapp',
] as const;
export type SupplierId = (typeof SUPPLIER_IDS)[number];

export interface SupplierCapabilities {
  readonly search: boolean;
  readonly deepLink: boolean;
  readonly hold: boolean;
  readonly book: boolean;
  readonly cancel: boolean;
  readonly status: boolean;
}

/** An amount as the supplier quoted it, in major units; the api converts to minor units. */
export interface SupplierMoney {
  readonly amount: number;
  readonly currency: string;
}

export const AGE_BANDS = ['ADULT', 'SENIOR', 'YOUTH', 'CHILD', 'INFANT', 'TRAVELER'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export interface PaxBand {
  readonly ageBand: AgeBand;
  readonly count: number;
}

export interface OfferQuery {
  /** The supplier's own destination id for the trip's place. */
  readonly destinationRef: string;
  readonly date: string;
  readonly currency: string;
  readonly limit?: number;
}

/** Verbatim supplier content plus the ids we may keep; see the file header. */
export interface SupplierOffer {
  readonly supplier: SupplierId;
  readonly productCode: string;
  readonly title: string;
  readonly description: string | null;
  readonly priceFrom: SupplierMoney | null;
  readonly holdSupported: boolean;
  readonly productUrl: string | null;
  /** When the price was read ("seen {time} on {supplier}"). */
  readonly seenAt: string;
}

export const DEEP_LINK_KINDS = ['stay', 'activity', 'transfer', 'ride'] as const;
export type DeepLinkKind = (typeof DEEP_LINK_KINDS)[number];

export interface DeepLinkTarget {
  readonly kind: DeepLinkKind;
  /** The partner's own page for the target, built by the partner's link builder. */
  readonly url: string;
}

export interface HoldItemRequest {
  /** Our reference for this item, echoed back by the supplier. */
  readonly itemRef: string;
  readonly productCode: string;
  readonly optionCode?: string;
  readonly travelDate: string;
  readonly startTime?: string;
  readonly pax: readonly PaxBand[];
}

export interface HoldRequest {
  /** Our cart reference (unique per order, reused on retry). */
  readonly cartRef: string;
  readonly currency: string;
  readonly items: readonly HoldItemRequest[];
  /** Origin the supplier's payment form is hosted on. */
  readonly hostingUrl: string;
}

export type HoldStatus = 'HOLDING' | 'HOLD_NOT_PROVIDED';

export interface HoldItemResult {
  readonly itemRef: string;
  readonly bookingRef: string;
  readonly bookable: boolean;
  readonly rejectionCode: string | null;
  readonly availability: HoldStatus | null;
  readonly availabilityUntil: string | null;
  readonly pricing: HoldStatus | null;
  readonly pricingUntil: string | null;
  readonly total: SupplierMoney | null;
}

export interface HoldResult {
  /** The supplier's cart reference. */
  readonly holdRef: string;
  /** Present only while every bookable item's price is held. */
  readonly priceHeldUntil?: string;
  /** Present only while every bookable item's seats are held (availability `HOLDING`). */
  readonly seatsHeldUntil?: string;
  readonly holdProvided: boolean;
  readonly items: readonly HoldItemResult[];
  readonly total: SupplierMoney;
  /** Opens the supplier's hosted payment form for this cart. */
  readonly paymentSessionToken: string | null;
}

export interface BookItemRequest {
  readonly bookingRef: string;
  readonly answers: readonly {
    readonly question: string;
    readonly answer: string;
    readonly unit?: string;
    readonly travelerNum?: number;
  }[];
}

export interface BookRequest {
  readonly holdRef: string;
  /** Token the supplier's payment form returned; we never see card data. */
  readonly paymentToken: string;
  readonly booker: { readonly firstName: string; readonly lastName: string };
  readonly communication: { readonly phone: string; readonly email?: string };
  readonly items: readonly BookItemRequest[];
}

export interface VoucherRef {
  readonly url: string;
  readonly format: string;
}

export type SupplierBookingState = 'confirmed' | 'pending' | 'rejected' | 'cancelled' | 'failed';

export interface BookingStatus {
  readonly bookingRef: string;
  readonly itemRef: string | null;
  readonly status: SupplierBookingState;
  readonly rejectionCode: string | null;
  readonly voucher: VoucherRef | null;
  readonly total: SupplierMoney | null;
  /** The supplier's own "poll again after" hint. */
  readonly nextPollAt: string | null;
}

export interface BookResult {
  readonly status: 'confirmed' | 'pending' | 'rejected';
  readonly bookingRef: string;
  readonly voucher?: VoucherRef;
  readonly items: readonly BookingStatus[];
}

export interface CancelQuote {
  readonly cancellable: boolean;
  readonly refund: SupplierMoney | null;
  readonly refundPercentage: number | null;
}

export interface CancelResult {
  readonly status: 'cancelled' | 'rejected';
  readonly reason: string | null;
}

export interface ModifiedSincePage {
  readonly changes: readonly BookingStatus[];
  readonly next: string | null;
}

export interface SupplierAdapter {
  readonly id: SupplierId;
  /** Server flag key (ops.partner_adapters partner or ops_config key). */
  readonly flag: string;
  readonly capabilities: SupplierCapabilities;
  search?(query: OfferQuery): Promise<readonly SupplierOffer[]>;
  deepLink?(
    target: DeepLinkTarget,
    ctx: { readonly subId: string },
  ): Promise<{ readonly url: string; readonly disclosure: 'affiliate' }>;
  hold?(request: HoldRequest): Promise<HoldResult>;
  book?(request: BookRequest): Promise<BookResult>;
  cancelQuote?(bookingRef: string): Promise<CancelQuote>;
  cancel?(bookingRef: string, reasonCode: string): Promise<CancelResult>;
  status?(bookingRef: string): Promise<BookingStatus>;
  pollModifiedSince?(cursor: string): Promise<ModifiedSincePage>;
}
