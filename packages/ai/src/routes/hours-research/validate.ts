/**
 * Code-side checks on an `hours.research` reply. The model only proposes; a proposal survives when
 * it cites a page the search returned, that page is no older than `HOURS_SOURCE_MAX_AGE_DAYS` when
 * its date is known, the confidence clears `HOURS_MIN_CONFIDENCE`, every span is well formed, and
 * every opening and closing time it uses is written on the cited page (a "24 hours" page for an
 * always-open place). Anything else is a decline, never a repair: hours are never invented.
 */
import { hoursSchema, WEEKDAYS, type Hours, type TimeSpan } from '@cp/domain';

import type { WebResult } from '../../tools/web-search';
import { hoursResearchReplySchema } from './schema';

export const HOURS_MIN_CONFIDENCE = 0.7;
/** Pages dated earlier than this are too old to trust for current hours. */
export const HOURS_SOURCE_MAX_AGE_DAYS = 400;

export interface HoursProposal {
  readonly hours: Hours;
  readonly sourceUrl: string;
  readonly fetchedAt: string;
  readonly confidence: number;
}

export type HoursCheck =
  | { readonly ok: true; readonly proposal: HoursProposal }
  | { readonly ok: false; readonly reason: string };

const DAY_MIN = 1_440;
const ALWAYS_OPEN: TimeSpan = { start: '00:00', end: '24:00' };
const ALWAYS_OPEN_TEXT =
  /24\s*(?:\/\s*7|hours|hrs|h\b|時間|giờ)|open\s+(?:all\s+day\s+and\s+night|around\s+the\s+clock)|around\s+the\s+clock|always\s+open|24-hour/iu;

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** Midnight reads as 00:00 or 24:00; both count as the same written time. */
const norm = (minutes: number): number => (minutes === DAY_MIN ? 0 : minutes);

function addClock(found: Set<number>, hour: number, minute: number, meridiem?: string): void {
  if (minute > 59 || hour > 24) return;
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return;
    const pm = meridiem.startsWith('p');
    found.add(norm(((hour % 12) + (pm ? 12 : 0)) * 60 + minute));
    return;
  }
  found.add(norm(hour * 60 + minute));
  // "9:00 - 5:00" on an English page means 17:00: a bare clock time may be either half of the day.
  if (hour >= 1 && hour < 12) found.add((hour + 12) * 60 + minute);
}

/** Every clock time a page writes, in minutes after midnight (00:00 and 24:00 both as 0). */
export function timesInText(text: string): Set<number> {
  const flat = text.normalize('NFKC').toLowerCase();
  const found = new Set<number>();
  for (const m of flat.matchAll(
    /(?<![\d:.])(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a\.?\s?m\b\.?|p\.?\s?m\b\.?)/gu,
  )) {
    addClock(found, Number(m[1]), Number(m[2] ?? 0), m[3]?.replace(/[^ap]/gu, ''));
  }
  for (const m of flat.matchAll(/(?<![\d.])(\d{1,2})\s*[:.h]\s*(\d{2})(?!\d|\s*[ap]\.?\s?m\b)/gu)) {
    addClock(found, Number(m[1]), Number(m[2]));
  }
  // "8h - 17h" (Vietnamese, French) and "9時～17時30分" / "9時半" (Japanese).
  for (const m of flat.matchAll(/(?<![\d.])(\d{1,2})\s*h(?![a-z\d])/gu))
    addClock(found, Number(m[1]), 0);
  for (const m of flat.matchAll(/(\d{1,2})時(?:(\d{1,2})分|(半))?/gu)) {
    addClock(found, Number(m[1]), m[3] === undefined ? Number(m[2] ?? 0) : 30);
  }
  if (/\bnoon\b|正午/u.test(flat)) found.add(720);
  if (/\bmidnight\b|深夜0時/u.test(flat)) found.add(0);
  return found;
}

function weeklyFrom(
  reply: ReturnType<typeof hoursResearchReplySchema.parse>,
): Hours['weekly'] | null {
  const weekly: Record<string, TimeSpan[]> = {};
  for (const day of WEEKDAYS) {
    const spans = reply.always_open ? [ALWAYS_OPEN] : reply.weekly[day];
    for (const span of spans) {
      if (span.start === span.end) return null;
    }
    if (spans.length > 0) {
      weekly[day] = [...spans].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    }
  }
  return weekly;
}

function ageInDays(publishedAt: string | null, now: Date): number | null {
  if (publishedAt === null) return null;
  const at = Date.parse(publishedAt);
  return Number.isNaN(at) ? null : (now.getTime() - at) / 86_400_000;
}

/** Checks one parsed reply against the search results it was written from. */
export function checkHoursReply(
  raw: unknown,
  results: readonly WebResult[],
  now: Date,
): HoursCheck {
  const parsed = hoursResearchReplySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'shape' };
  const reply = parsed.data;
  if (reply.decision === 'decline') return { ok: false, reason: 'declined' };
  if (reply.confidence < HOURS_MIN_CONFIDENCE) return { ok: false, reason: 'low_confidence' };
  const source = results.find((result) => result.url === reply.source_url);
  if (source === undefined) return { ok: false, reason: 'unknown_source' };
  const age = ageInDays(source.published_at, now);
  if (age !== null && age > HOURS_SOURCE_MAX_AGE_DAYS) return { ok: false, reason: 'stale_source' };

  const weekly = weeklyFrom(reply);
  if (weekly === null) return { ok: false, reason: 'bad_span' };
  const hours = hoursSchema.safeParse({ weekly });
  if (!hours.success) return { ok: false, reason: 'bad_span' };
  if (Object.keys(weekly).length === 0) return { ok: false, reason: 'no_hours' };

  const page = `${source.title}\n${source.snippet}`;
  if (reply.always_open) {
    if (!ALWAYS_OPEN_TEXT.test(page.normalize('NFKC'))) {
      return { ok: false, reason: 'time_not_in_source' };
    }
  } else {
    const written = timesInText(page);
    const used = Object.values(weekly).flatMap((spans) => spans.flatMap((s) => [s.start, s.end]));
    if (used.some((time) => !written.has(norm(toMinutes(time))))) {
      return { ok: false, reason: 'time_not_in_source' };
    }
  }
  return {
    ok: true,
    proposal: {
      hours: hours.data,
      sourceUrl: source.url,
      fetchedAt: source.fetched_at,
      confidence: reply.confidence,
    },
  };
}
