/**
 * The partners a traveller can be sent to by link (docs/data-model.md §3.7 `affiliate_clicks`):
 * stays and activities through Travelpayouts, Booking.com through CJ, transfers, and Viator's
 * own affiliate links while its booking API is off. Each click carries an opaque sub id, never a
 * user id, so a partner's report can be joined back to the click and nothing else.
 */
import { z } from 'zod';

export const AFFILIATE_PARTNERS = [
  'agoda',
  'trip_com',
  'booking_cj',
  'klook',
  'gyg',
  'kiwitaxi',
  'gettransfer',
  'viator',
  'grab',
  'travelpayouts',
] as const;
export const affiliatePartnerSchema = z.enum(AFFILIATE_PARTNERS);
export type AffiliatePartner = z.infer<typeof affiliatePartnerSchema>;

/** What a link opens: a stay search, an activity, an airport transfer or a ride app. */
export const AFFILIATE_TARGET_KINDS = ['stay', 'activity', 'transfer', 'ride'] as const;
export const affiliateTargetKindSchema = z.enum(AFFILIATE_TARGET_KINDS);
export type AffiliateTargetKind = z.infer<typeof affiliateTargetKindSchema>;

/** Partner reports mark a sale as still processing, paid out or cancelled. */
export const AFFILIATE_CONVERSION_STATUSES = ['processing', 'paid', 'cancelled'] as const;
export type AffiliateConversionStatus = (typeof AFFILIATE_CONVERSION_STATUSES)[number];

/** Suppliers an in-app order can be placed with (each behind its own partner flag). */
export const ORDER_SUPPLIERS = ['viator', 'agoda', 'klook', 'trip_com', 'gyg'] as const;
export const orderSupplierSchema = z.enum(ORDER_SUPPLIERS);
export type OrderSupplier = z.infer<typeof orderSupplierSchema>;

/** Opaque click reference: 20 url-safe characters, no user or trip id inside. */
export const SUB_ID_PATTERN = /^[A-Za-z0-9_-]{20}$/;
