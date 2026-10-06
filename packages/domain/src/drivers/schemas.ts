/**
 * Finding a driver (docs/api-contracts-suppliers.md §4.11, 6a–6f): the command payloads, the fields
 * read from a shared driver message, and the reads the app gets back. Users bring drivers in; we
 * never read or post to groups, and every WhatsApp message is sent by the user from their own app.
 */
import { z } from 'zod';

import { currencyCodeSchema, moneyMinorSchema } from '../money/expense-schema';

export const INTAKE_KINDS = ['text', 'link', 'image', 'contact'] as const;
export type IntakeKind = (typeof INTAKE_KINDS)[number];
export const INTAKE_STATUSES = ['pending', 'parsed', 'failed', 'used'] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

/** What a driver's price covers; `unknown` until he says. */
export const INCLUDE_KEYS = ['fuel', 'parking', 'tolls', 'entry'] as const;
export type IncludeKey = (typeof INCLUDE_KEYS)[number];
export const includeValueSchema = z.enum(['yes', 'no', 'unknown']);
export type IncludeValue = z.infer<typeof includeValueSchema>;
export const includesSchema = z
  .object({
    fuel: includeValueSchema,
    parking: includeValueSchema,
    tolls: includeValueSchema,
    entry: includeValueSchema,
  })
  .partial()
  .strict();
export type Includes = z.infer<typeof includesSchema>;

export const PRICE_UNITS = ['day', 'hours', 'trip', 'car', 'group'] as const;
export const priceUnitSchema = z.enum(PRICE_UNITS);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

/** The lines of a driver card (6c-2), each confirmed separately. */
export const DRIVER_FIELDS = [
  'name',
  'phone',
  'languages',
  'car',
  'price',
  'includes',
  'overtime',
] as const;
export type DriverField = (typeof DRIVER_FIELDS)[number];
export const driverFieldSchema = z.enum(DRIVER_FIELDS);

/** Where a field was read in the shared text: `[start, end)` character offsets. */
export const sourceSpanSchema = z.tuple([z.number().int().min(0), z.number().int().min(0)]);
export type SourceSpan = z.infer<typeof sourceSpanSchema>;

const hhmm = z.string().regex(/^[0-2]\d:[0-5]\d$/u, 'HH:MM');
const phoneSchema = z.string().regex(/^\+[1-9]\d{6,14}$/u, 'E.164');

/** A driver card as read from a message, every field optional; `spans` says where each was read. */
export const driverCardSchema = z
  .object({
    name: z.string().trim().min(1).max(120).nullable(),
    phone: phoneSchema.nullable(),
    area: z.string().trim().min(1).max(80).nullable(),
    languages: z.array(z.string().trim().min(2).max(20)).max(8),
    car: z.string().trim().min(1).max(80).nullable(),
    seats: z.number().int().min(1).max(60).nullable(),
    price_minor: moneyMinorSchema.nullable(),
    currency: currencyCodeSchema.nullable(),
    price_unit: priceUnitSchema.nullable(),
    included_hours: z.number().positive().max(24).nullable(),
    includes: includesSchema,
    overtime_minor: moneyMinorSchema.nullable(),
    licence_shown: z.boolean().nullable(),
  })
  .strict();
export type DriverCard = z.infer<typeof driverCardSchema>;

export const EMPTY_DRIVER_CARD: DriverCard = {
  name: null,
  phone: null,
  area: null,
  languages: [],
  car: null,
  seats: null,
  price_minor: null,
  currency: null,
  price_unit: null,
  included_hours: null,
  includes: {},
  overtime_minor: null,
  licence_shown: null,
};

/** What reading a shared item answered: the card, where each field came from, and why not. */
export const parsedIntakeSchema = z
  .object({
    card: driverCardSchema,
    spans: z.partialRecord(driverFieldSchema, sourceSpanSchema),
    /** Short reasons a field could not be read ("cut off above the phone number"). */
    unreadable: z.array(z.string().max(160)).max(6),
    /** The model's own description of an image, for the 6c-3 crop line; null for text. */
    cut_off: z.boolean(),
  })
  .strict();
export type ParsedIntake = z.infer<typeof parsedIntakeSchema>;

/** `share_provider_intake` (offline): a pasted message, a screenshot's text or a contact card. */
export const shareProviderIntakePayloadSchema = z
  .object({
    intake_id: z.uuid(),
    trip_id: z.uuid(),
    kind: z.enum(INTAKE_KINDS),
    text: z.string().trim().min(1).max(8000),
  })
  .strict();
export type ShareProviderIntakePayload = z.infer<typeof shareProviderIntakePayloadSchema>;

/**
 * `confirm_provider_fields`: the traveller checked every line of the card; it becomes a shortlisted
 * driver for the crew. `provider_id` is the app's, so a replay answers the same driver.
 */
export const confirmProviderFieldsPayloadSchema = z
  .object({
    provider_id: z.uuid(),
    trip_id: z.uuid(),
    intake_id: z.uuid().optional(),
    card: driverCardSchema.extend({ name: z.string().trim().min(1).max(120) }),
    confirmed: z.array(driverFieldSchema).min(1).max(DRIVER_FIELDS.length),
  })
  .strict();
export type ConfirmProviderFieldsPayload = z.infer<typeof confirmProviderFieldsPayloadSchema>;

/** `shortlist_provider`: a private tour into the comparison (product id and shown price only). */
export const shortlistProviderPayloadSchema = z
  .object({
    provider_id: z.uuid(),
    trip_id: z.uuid(),
    supplier: z.enum(['klook', 'viator']),
    product_id: z.string().trim().min(1).max(100),
    price_minor: moneyMinorSchema,
    currency: currencyCodeSchema,
    price_unit: z.enum(['car', 'group']),
    included_hours: z.number().positive().max(24).nullable(),
    seats: z.number().int().min(1).max(60).nullable(),
  })
  .strict();
export type ShortlistProviderPayload = z.infer<typeof shortlistProviderPayloadSchema>;

/** `archive_provider`: drop a driver from the shortlist (his past days stay). */
export const archiveProviderPayloadSchema = z
  .object({ provider_id: z.uuid(), trip_id: z.uuid() })
  .strict();

export const assignedDaySchema = z
  .object({
    date: z.iso.date(),
    window_start: hhmm.nullable(),
    window_end: hhmm.nullable(),
    pickup: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();
export type AssignedDay = z.infer<typeof assignedDaySchema>;

/** `assign_provider` (direct SET, or the op of an applied crew vote). */
export const assignProviderPayloadSchema = z
  .object({
    trip_id: z.uuid(),
    provider_id: z.uuid(),
    days: z.array(assignedDaySchema).min(1).max(31),
  })
  .strict();
export type AssignProviderPayload = z.infer<typeof assignProviderPayloadSchema>;

/** The terms a driver is taken on, as the ride-back card shows them (`provider_assignments.agreed`). */
export const agreedTermsSchema = z
  .object({
    price_minor: moneyMinorSchema.nullable(),
    currency: currencyCodeSchema.nullable(),
    price_unit: priceUnitSchema.nullable(),
    included_hours: z.number().positive().max(24).nullable(),
    includes: includesSchema,
    overtime_minor: moneyMinorSchema.nullable(),
  })
  .strict();
export type AgreedTerms = z.infer<typeof agreedTermsSchema>;

/**
 * What an `assign_provider` change carries when the crew votes on the pick: the days, each once,
 * and the terms voted on (a driver's quote). Without `terms` the driver's shortlisted terms are
 * the ones agreed.
 */
export const providerAssignmentSchema = z
  .object({
    days: z
      .array(assignedDaySchema)
      .min(1)
      .max(31)
      .refine((days) => new Set(days.map((day) => day.date)).size === days.length, {
        message: 'a day is listed twice',
      }),
    terms: agreedTermsSchema.optional(),
  })
  .strict();
export type ProviderAssignment = z.infer<typeof providerAssignmentSchema>;

/** `dismiss_pickup_gap` (offline): NOT NOW on a day's driver card, for the caller only. */
export const dismissPickupGapPayloadSchema = z
  .object({ trip_id: z.uuid(), date: z.iso.date() })
  .strict();
export type DismissPickupGapPayload = z.infer<typeof dismissPickupGapPayloadSchema>;

/** `POST /v1/drivers/intake/{id}/read`: answers the parsed card (or why it could not). */
export interface IntakeReadResult {
  readonly intake_id: string;
  readonly status: Extract<IntakeStatus, 'parsed' | 'failed'>;
  readonly parsed: ParsedIntake | null;
}

/** `GET /v1/drivers/intake?trip_id=`: the trip's SHARED WITH TOKEK list. */
export interface IntakeItem {
  readonly id: string;
  readonly kind: IntakeKind;
  readonly status: IntakeStatus;
  readonly shared_by: string;
  readonly shared_by_name: string | null;
  readonly text: string | null;
  readonly parsed: ParsedIntake | null;
  readonly provider_id: string | null;
  readonly created_at: string;
}

/** `GET /v1/drivers/private-tours?trip_id&days`. */
export const privateToursQuerySchema = z
  .object({
    trip_id: z.uuid(),
    days: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2}){0,13}$/u)
      .optional(),
  })
  .strict();
export type PrivateToursQuery = z.infer<typeof privateToursQuerySchema>;
