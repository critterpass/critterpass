/**
 * Sharing the plan with a driver or guide: a no-login page (`/t/{token}`) with the days they are
 * needed, a PDF of the same, and a reply form (a quote, a suggested order per day and tips) that
 * reaches the crew as a proposal. The page carries first names only, never budgets, prices other
 * than the driver's own terms, chat, votes, last names or phone numbers.
 */
import { z } from 'zod';

export const DRIVER_PLAN_DEFAULT_EXPIRY_DAYS = 14;
export const DRIVER_PLAN_MAX_EXPIRY_DAYS = 60;
export const DRIVER_PLAN_MAX_TIPS = 5;
export const DRIVER_PLAN_TIP_MAX_CHARS = 280;
export const DRIVER_PLAN_NOTE_MAX_CHARS = 280;
export const DRIVER_PLAN_LOCALES = ['en', 'id'] as const;
export type DriverPlanLocale = (typeof DRIVER_PLAN_LOCALES)[number];

/** What a driver's day price can include; the form shows them as checkboxes. */
export const DRIVER_PLAN_INCLUDES = ['petrol', 'parking', 'tolls', 'entry_tickets'] as const;
export type DriverPlanInclude = (typeof DRIVER_PLAN_INCLUDES)[number];

export const DRIVER_PLAN_PATH_PREFIX = 't';

/** The page's path; the page is web-only (never a Universal Link). */
export function driverPlanPath(token: string): string {
  return `/${DRIVER_PLAN_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

const dayNosSchema = z.array(z.number().int().positive().max(60)).min(1).max(60);
const expiryDaysSchema = z.number().int().min(1).max(DRIVER_PLAN_MAX_EXPIRY_DAYS);

export const createDriverPlanSharePayloadSchema = z.object({
  share_id: z.uuid().optional(),
  trip_id: z.uuid(),
  provider_id: z.uuid().nullable().optional(),
  /** The driver's first name as the crew knows them; only the crew sees it. */
  driver_name: z.string().trim().min(1).max(40),
  day_nos: dayNosSchema,
  expires_in_days: expiryDaysSchema.default(DRIVER_PLAN_DEFAULT_EXPIRY_DAYS),
  allow_quote: z.boolean().default(true),
});
export type CreateDriverPlanSharePayload = z.infer<typeof createDriverPlanSharePayloadSchema>;

export const updateDriverPlanSharePayloadSchema = z
  .object({
    share_id: z.uuid(),
    day_nos: dayNosSchema.optional(),
    expires_in_days: expiryDaysSchema.optional(),
    allow_quote: z.boolean().optional(),
  })
  .refine(
    (p) =>
      p.day_nos !== undefined || p.expires_in_days !== undefined || p.allow_quote !== undefined,
    { message: 'nothing to update' },
  );
export type UpdateDriverPlanSharePayload = z.infer<typeof updateDriverPlanSharePayloadSchema>;

export const revokeDriverPlanSharePayloadSchema = z.object({ share_id: z.uuid() });

/** A share as the crew sees it in the share sheet. */
export const driverPlanShareSchema = z.object({
  id: z.uuid(),
  trip_id: z.uuid(),
  provider_id: z.uuid().nullable(),
  driver_name: z.string(),
  day_nos: z.array(z.number().int()),
  allow_quote: z.boolean(),
  expires_at: z.iso.datetime({ offset: true }),
  revoked_at: z.iso.datetime({ offset: true }).nullable(),
  open_count: z.number().int().nonnegative(),
  last_opened_at: z.iso.datetime({ offset: true }).nullable(),
  /** The full page URL; present while the share is live. */
  url: z.string().nullable(),
});
export type DriverPlanShare = z.infer<typeof driverPlanShareSchema>;

const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|id|app|io|co|me|ly|link)\b)/iu;

/** True when free text from the public form carries a link; tips and notes may not. */
export function containsUrl(text: string): boolean {
  return URL_PATTERN.test(text);
}

const noUrlText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((t) => !containsUrl(t), { message: 'no_links' });

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u);

export const driverPlanDaySuggestionSchema = z.object({
  day_no: z.number().int().positive(),
  /** The day's stop refs in the driver's order (every ref of the day, each once). */
  order: z.array(z.uuid()).max(40),
  /** New start times, local `HH:MM`, for stops the driver re-timed. */
  retime: z
    .array(z.object({ ref: z.uuid(), at: clockSchema }))
    .max(40)
    .default([]),
  note: noUrlText(DRIVER_PLAN_NOTE_MAX_CHARS).optional(),
});
export type DriverPlanDaySuggestion = z.infer<typeof driverPlanDaySuggestionSchema>;

export const driverPlanQuoteSchema = z.object({
  price_per_day_minor: z.number().int().positive().max(1_000_000_000_000),
  currency: z.string().length(3),
  includes: z.array(z.enum(DRIVER_PLAN_INCLUDES)).max(DRIVER_PLAN_INCLUDES.length).default([]),
  overtime_per_hour_minor: z.number().int().nonnegative().nullable().default(null),
  included_hours: z.number().int().min(1).max(24).nullable().default(null),
  car: z.string().trim().max(80).nullable().default(null),
});
export type DriverPlanQuote = z.infer<typeof driverPlanQuoteSchema>;

export const driverPlanReplyPayloadSchema = z
  .object({
    quote: driverPlanQuoteSchema.nullable().default(null),
    days: z.array(driverPlanDaySuggestionSchema).max(60).default([]),
    tips: z
      .array(
        z.object({
          day_no: z.number().int().positive().nullable().default(null),
          text: noUrlText(DRIVER_PLAN_TIP_MAX_CHARS),
        }),
      )
      .max(DRIVER_PLAN_MAX_TIPS)
      .default([]),
  })
  .refine((r) => r.quote !== null || r.days.length > 0 || r.tips.length > 0, {
    message: 'empty_reply',
  });
export type DriverPlanReplyPayload = z.infer<typeof driverPlanReplyPayloadSchema>;

export const DRIVER_PLAN_REPLY_STATUSES = ['open', 'replaced', 'decided'] as const;

/** One stop of the driver's view. */
export const driverViewStopSchema = z.object({
  ref: z.uuid(),
  /** Local `HH:MM` in the trip's time zone; null for an untimed stop. */
  time: z.string().nullable(),
  name: z.string(),
  /** The place's name in the local language, when the place database has one. */
  name_local: z.string().nullable(),
  address: z.string().nullable(),
  duration_min: z.number().int().nonnegative().nullable(),
  must_do: z.boolean(),
  /** Tickets or a booking already in hand. */
  booked: z.boolean(),
  /** A pickup point (the stay or a station): the page shows its pin. */
  pickup: z.boolean(),
  maps_url: z.string().nullable(),
});
export type DriverViewStop = z.infer<typeof driverViewStopSchema>;

export const driverViewDaySchema = z.object({
  day_no: z.number().int(),
  date: z.string().nullable(),
  stops: z.array(driverViewStopSchema),
});
export type DriverViewDay = z.infer<typeof driverViewDaySchema>;

/** The public projection: the only shape the page, the PDF and the OG image are built from. */
export const driverViewSchema = z.object({
  sharer_first_name: z.string(),
  party_size: z.number().int().nonnegative(),
  first_names: z.array(z.string()),
  stay_area: z.string().nullable(),
  must_dos: z.array(z.string()),
  days: z.array(driverViewDaySchema),
  /** The driver's own agreed terms, once the crew accepted a quote. */
  terms: driverPlanQuoteSchema.nullable(),
});
export type DriverView = z.infer<typeof driverViewSchema>;

/** `GET /v1/public/driver-plans/{token}`: the view plus the page's own state. */
export const driverPlanPageSchema = z.object({
  view: driverViewSchema,
  allow_quote: z.boolean(),
  expires_at: z.iso.datetime({ offset: true }),
  /** Set when the plan changed after the link was made. */
  updated_at: z.iso.datetime({ offset: true }).nullable(),
  /** The driver's reply still with the crew, when there is one. */
  open_reply_at: z.iso.datetime({ offset: true }).nullable(),
});
export type DriverPlanPage = z.infer<typeof driverPlanPageSchema>;

/** The switched-off page's facts (`SHARE_REVOKED` / `SHARE_EXPIRED` detail). */
export const driverPlanOffDetailSchema = z.object({
  sharer_first_name: z.string(),
  off_at: z.iso.datetime({ offset: true }),
  reply_at: z.iso.datetime({ offset: true }).nullable(),
});
export type DriverPlanOffDetail = z.infer<typeof driverPlanOffDetailSchema>;

/** The first word of a display name: the page never shows a last name. */
export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/u)[0];
  return first === undefined || first === '' ? null : first;
}
