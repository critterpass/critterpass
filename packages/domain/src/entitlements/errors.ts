/**
 * Detail payload shapes for the entitlement-related codes already in `ERROR_CODES`
 * (packages/domain/src/errors.ts): `DomainError#detail` is `unknown` there because each code's shape
 * is owned by whoever throws it — these are the four entitlement codes' shapes, one schema each.
 */
import { z } from 'zod';

import { capabilityKeySchema } from './capability-keys';

export const quotaExhaustedDetailSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  resetAt: z.iso.datetime({ offset: true }),
  /** Crew-chat guide asks only: members whose Pass+ already makes this ask unmetered. */
  crewPassHolders: z.array(z.uuid()).optional(),
});
export type QuotaExhaustedDetail = z.infer<typeof quotaExhaustedDetailSchema>;

export const redraftLimitDetailSchema = z.object({
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
});
export type RedraftLimitDetail = z.infer<typeof redraftLimitDetailSchema>;

export const SEAT_LIMIT_OFFERS = ['boost', 'waitlist'] as const;
export const seatLimitOfferSchema = z.enum(SEAT_LIMIT_OFFERS);
export type SeatLimitOffer = z.infer<typeof seatLimitOfferSchema>;

export const seatLimitDetailSchema = z.object({
  cap: z.number().int().positive(),
  offer: seatLimitOfferSchema,
});
export type SeatLimitDetail = z.infer<typeof seatLimitDetailSchema>;

export const entitlementRequiredDetailSchema = z.object({
  perk: capabilityKeySchema,
  /** Product keys a purchase could satisfy this with; validated against the closed set once the
   * `products` table (a later task) defines it — kept as non-empty strings here to avoid coupling
   * this schema to that table's exact enum before it exists. */
  offers: z.array(z.string().min(1)),
});
export type EntitlementRequiredDetail = z.infer<typeof entitlementRequiredDetailSchema>;
