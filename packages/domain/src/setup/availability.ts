/**
 * Trip setup, dates (docs/api-contracts.md §4.5): date-level availability only. A day is `free`,
 * `maybe` (a tentative block the member opted to share as "maybe busy"), `busy` or `unknown`; no
 * title, attendee or time ever leaves the member's device or calendar account. Raw days are C3
 * (owner-only); the crew sees per-date counts and the window options derived from them.
 */
import { z } from 'zod';

export const DAY_STATES = ['free', 'maybe', 'busy', 'unknown'] as const;
export const dayStateSchema = z.enum(DAY_STATES);
export type DayState = z.infer<typeof dayStateSchema>;

/** What a member may report; `unknown` is the absence of a row. */
export const REPORTED_DAY_STATES = ['free', 'maybe', 'busy'] as const;
export const reportedDayStateSchema = z.enum(REPORTED_DAY_STATES);

export const DAY_SOURCES = ['manual', 'device_cal', 'oauth'] as const;
export const daySourceSchema = z.enum(DAY_SOURCES);
export type DaySource = z.infer<typeof daySourceSchema>;

export const CALENDAR_SOURCE_KINDS = [
  'device',
  'oauth_google',
  'oauth_microsoft',
  'manual',
] as const;
export const calendarSourceKindSchema = z.enum(CALENDAR_SOURCE_KINDS);
export type CalendarSourceKind = z.infer<typeof calendarSourceKindSchema>;

export const CALENDAR_SOURCE_STATUSES = ['active', 'error', 'disconnected'] as const;
export type CalendarSourceStatus = (typeof CALENDAR_SOURCE_STATUSES)[number];

export const OAUTH_CALENDAR_PROVIDERS = ['google', 'microsoft'] as const;
export const oauthCalendarProviderSchema = z.enum(OAUTH_CALENDAR_PROVIDERS);
export type OAuthCalendarProvider = z.infer<typeof oauthCalendarProviderSchema>;

export const ASK_ANSWERS = ['freed', 'not_movable'] as const;
export const askAnswerSchema = z.enum(ASK_ANSWERS);
export type AskAnswer = z.infer<typeof askAnswerSchema>;

export const ASK_STATUSES = ['asked', 'replied', 'timed_out'] as const;
export type AskStatus = (typeof ASK_STATUSES)[number];

/** How the organiser sees an ask on its window option: never the event, only the outcome. */
export const ASK_RESOLUTIONS = ['asked', 'freed', 'not_movable', 'timed_out'] as const;
export type AskResolution = (typeof ASK_RESOLUTIONS)[number];

export const WINDOW_OPTION_KINDS = ['best', 'partial', 'full_crew', 'ask_first'] as const;
export const windowOptionKindSchema = z.enum(WINDOW_OPTION_KINDS);
export type WindowOptionKind = z.infer<typeof windowOptionKindSchema>;

/** Setup looks ahead at most six months. */
export const AVAILABILITY_HORIZON_DAYS = 183;
export const TRIP_LENGTH_MIN_DAYS = 1;
export const TRIP_LENGTH_MAX_DAYS = 30;
/** An OAuth calendar or device sync older than this is stale ("synced 3 d ago"). */
export const CALENDAR_STALE_HOURS = 72;
/** A private ask the member has not answered falls back to the best partial option. */
export const AVAILABILITY_ASK_TIMEOUT_HOURS = 48;

const isoDate = z.iso.date();

const dayInputSchema = z.strictObject({
  date: isoDate,
  state: reportedDayStateSchema,
  source: daySourceSchema,
  /**
   * The guide may privately ask about this day (default: yes for `maybe`, never for others).
   * Only a `maybe` day can be asked about.
   */
  may_ask: z.boolean().optional(),
});
export type AvailabilityDayInput = z.infer<typeof dayInputSchema>;

export const setAvailabilityPayloadSchema = z
  .strictObject({
    /** The trip the member is setting up; its window options recompute first. */
    trip_id: z.uuid().optional(),
    days: z.array(dayInputSchema).max(AVAILABILITY_HORIZON_DAYS + 7),
    /** Dates to forget (back to unknown), e.g. a manual mark the member took back. */
    clear: z
      .array(isoDate)
      .max(AVAILABILITY_HORIZON_DAYS + 7)
      .optional(),
    /** Device sync: whether tentative events were shared as `maybe` (opt-in). */
    consent_tentative: z.boolean().optional(),
  })
  .refine((p) => new Set(p.days.map((d) => d.date)).size === p.days.length, {
    message: 'one entry per date',
    path: ['days'],
  });
export type SetAvailabilityPayload = z.infer<typeof setAvailabilityPayloadSchema>;

export const connectCalendarPayloadSchema = z.strictObject({
  provider: oauthCalendarProviderSchema,
  auth_code: z.string().min(1).max(4096),
  /** The `state` the OAuth start issued to this session. */
  state: z.string().min(16).max(128),
});
export type ConnectCalendarPayload = z.infer<typeof connectCalendarPayloadSchema>;

export const disconnectCalendarPayloadSchema = z.strictObject({ source_id: z.uuid() });
export type DisconnectCalendarPayload = z.infer<typeof disconnectCalendarPayloadSchema>;

const dateRangeSchema = z
  .strictObject({ start: isoDate, end: isoDate })
  .refine((r) => r.start <= r.end, { message: 'start after end', path: ['end'] });

export const askAvailabilityPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  target_uid: z.uuid(),
  range: dateRangeSchema,
  /** The ask-first window option the organiser picked, when asked from the options. */
  option_id: z.uuid().optional(),
});
export type AskAvailabilityPayload = z.infer<typeof askAvailabilityPayloadSchema>;

export const answerAvailabilityAskPayloadSchema = z
  .strictObject({
    ask_id: z.uuid(),
    /** A quick reply; absent when the member answered in words. */
    answer: askAnswerSchema.optional(),
    /** A free-text reply; the guide reads its intent and keeps nothing else. */
    text: z.string().trim().min(1).max(500).optional(),
  })
  .refine((p) => p.answer !== undefined || p.text !== undefined, {
    message: 'answer or text',
    path: ['answer'],
  });
export type AnswerAvailabilityAskPayload = z.infer<typeof answerAvailabilityAskPayloadSchema>;

export const lockTripDatesPayloadSchema = z
  .strictObject({ trip_id: z.uuid(), start: isoDate, end: isoDate })
  .refine((p) => p.start <= p.end, { message: 'start after end', path: ['end'] });
export type LockTripDatesPayload = z.infer<typeof lockTripDatesPayloadSchema>;

/** `GET /v1/setup/{trip_id}/windows?length` query. */
export const windowsQuerySchema = z.strictObject({
  length: z.coerce.number().int().min(TRIP_LENGTH_MIN_DAYS).max(TRIP_LENGTH_MAX_DAYS).optional(),
});

export interface WindowOptionWire {
  readonly kind: WindowOptionKind;
  readonly start_date: string;
  readonly end_date: string;
  readonly free_count: number;
  readonly member_count: number;
  readonly missing_member_ids: readonly string[];
  readonly missed_must_do_ids: readonly string[];
  readonly ask_user_id: string | null;
  readonly price_delta_minor: number | null;
  readonly currency: string | null;
  readonly season_score: number;
  readonly reason: string;
  readonly is_pick: boolean;
}

export interface WindowsResult {
  readonly trip_id: string;
  readonly length_days: number;
  readonly member_count: number;
  readonly synced_count: number;
  readonly options: readonly WindowOptionWire[];
}
