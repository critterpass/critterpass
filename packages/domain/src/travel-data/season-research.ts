/**
 * Season events research (docs/product-decisions.md D23): each month code builds web search queries
 * for one destination and month from fixed event keywords (places, dates and topics only; never
 * user data), a model extracts dated candidates with their source, and the candidates wait in the
 * season review queue (`season_events` rows with `reviewed_at` null, which nothing serves) until a
 * content reviewer approves or rejects them.
 */
import { z } from 'zod';

import { ALLOW, deny, type PolicyActor, type PolicyResult } from '../policy/types';
import { seasonEventKindSchema, type SeasonEventKind } from './types';

/** Months ahead the monthly run researches: far enough for editors to review before trips plan it. */
export const SEASON_RESEARCH_LEAD_MONTHS = 3;

/** One query per topic; `{place}`, `{month}` and `{year}` are filled in by code. */
export const SEASON_RESEARCH_TOPICS = [
  '{place} festivals and events {month} {year}',
  '{place} public holidays and closures {month} {year}',
  '{place} {month} {year} cherry blossom or autumn foliage season dates',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface SeasonResearchTarget {
  /** Destination name as travellers search it, with its country when known. */
  readonly place: string;
  /** `YYYY-MM`. */
  readonly month: string;
}

export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

/** The month `SEASON_RESEARCH_LEAD_MONTHS` after `now`'s month (UTC), as `YYYY-MM`. */
export function seasonResearchMonth(now: Date, lead = SEASON_RESEARCH_LEAD_MONTHS): string {
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + lead, 1));
  return target.toISOString().slice(0, 7);
}

export function seasonResearchQueries(target: SeasonResearchTarget): string[] {
  const fill = {
    place: target.place,
    month: monthName(target.month),
    year: target.month.slice(0, 4),
  };
  return SEASON_RESEARCH_TOPICS.map((topic) =>
    topic.replace(/\{(place|month|year)\}/gu, (_, key: keyof typeof fill) => fill[key]),
  );
}

const isoDate = z.iso.date();

/** One extracted event as the model returns it (its fetch time is added from the search result). */
export const seasonResearchEventSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    kind: seasonEventKindSchema,
    starts_on: isoDate,
    ends_on: isoDate,
    source_url: z.url(),
  })
  .refine((event) => event.ends_on >= event.starts_on, { path: ['ends_on'] });

/** The extraction reply: every event it found for the destination and month. */
export const seasonResearchReplySchema = z.object({
  events: z.array(z.unknown()),
});

/** A candidate as it enters the review queue. */
export interface SeasonResearchCandidate {
  readonly name: string;
  readonly kind: SeasonEventKind;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly source_url: string;
  /** When our search fetched the source page (ISO instant). */
  readonly fetched_at: string;
}

/** Lower-case letters and digits only, accents and years dropped: "Jidai Matsuri 2026" → "jidaimatsuri". */
export function normaliseEventName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Stable review-queue key: `web-<name>-<year>`, kebab-case like editorial keys. */
export function seasonResearchKey(candidate: Pick<SeasonResearchCandidate, 'name' | 'starts_on'>) {
  const slug = candidate.name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 60)
    .replace(/-+$/u, '');
  return `web-${slug.length > 0 ? slug : 'event'}-${candidate.starts_on.slice(0, 4)}`;
}

const DAY_MS = 86_400_000;
/** Dates that differ by this many days still describe the same edition of an event. */
const SAME_EDITION_SLACK_DAYS = 7;

export interface DatedEventName {
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
}

/**
 * Same event: the names match (one normalised name containing the other counts, from four
 * characters) and the date ranges overlap, give or take a week. Last year's edition is a different
 * event row, so it is proposed again with this year's dates.
 */
export function isSameSeasonEvent(a: DatedEventName, b: DatedEventName): boolean {
  const left = normaliseEventName(a.name);
  const right = normaliseEventName(b.name);
  const shorter = left.length <= right.length ? left : right;
  const longer = shorter === left ? right : left;
  const namesMatch = shorter.length >= 4 ? longer.includes(shorter) : left === right;
  if (!namesMatch) return false;
  const slack = SAME_EDITION_SLACK_DAYS * DAY_MS;
  const start = (date: string) => Date.parse(`${date}T00:00:00Z`);
  return (
    start(a.starts_on) <= start(b.ends_on) + slack && start(b.starts_on) <= start(a.ends_on) + slack
  );
}

/** True when the event touches `month` (`YYYY-MM`). */
export function overlapsMonth(event: Pick<DatedEventName, 'starts_on' | 'ends_on'>, month: string) {
  return event.starts_on.slice(0, 7) <= month && event.ends_on.slice(0, 7) >= month;
}

/** `review_season_event` (admin, content role): approve serves a queued row; reject removes it. */
export const reviewSeasonEventInputSchema = z
  .object({
    event_id: z.uuid(),
    decision: z.enum(['approve', 'reject']),
  })
  .strict();
export type ReviewSeasonEventInput = z.infer<typeof reviewSeasonEventInputSchema>;

export function canReviewSeasonEvents(actor: PolicyActor): PolicyResult {
  return actor.roles.includes('content') ? ALLOW : deny('FORBIDDEN');
}
