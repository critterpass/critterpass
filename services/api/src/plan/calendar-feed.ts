/**
 * The member's own plan as an RFC 5545 calendar (docs/api-contracts.md §5.5): the crew's current
 * version with their personal ops laid over it, only the items they attend. Every event keeps its
 * plan item's stable id as UID (so a subscribed calendar updates events in place when the plan
 * changes) and its instants in UTC; an item with no time is an all-day event on its day. The feed
 * is found by the SHA-256 of its secret, never the secret itself, and a revoked feed, or one whose
 * member left the crew, answers 404.
 */
import { createHash } from 'node:crypto';

import { changeSetOpsSchema } from '@cp/domain';
import { mergeOverlay, type OverlayItem } from '@cp/planner';
import type pg from 'pg';

import { loadPlanState } from './versioning';

export function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

export interface FeedEvent {
  readonly uid: string;
  readonly summary: string;
  readonly description: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** `YYYY-MM-DD` of the item's day, for untimed items. */
  readonly date: string | null;
}

export interface FeedCalendar {
  readonly name: string;
  readonly tz: string | null;
  readonly events: readonly FeedEvent[];
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (RFC 5545 §3.1), never inside a UTF-8 sequence. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, 'utf8');
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

const utc = (iso: string) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const dateValue = (date: string) => date.replace(/-/g, '');

function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function renderIcs(calendar: FeedCalendar, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CritterPass//Trip plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    ...(calendar.tz === null ? [] : [`X-WR-TIMEZONE:${calendar.tz}`]),
  ];
  for (const event of calendar.events) {
    const timed = event.startsAt !== null;
    if (!timed && event.date === null) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@critterpass.app`,
      `DTSTAMP:${utc(now.toISOString())}`,
      timed
        ? `DTSTART:${utc(event.startsAt ?? '')}`
        : `DTSTART;VALUE=DATE:${dateValue(event.date ?? '')}`,
      timed
        ? `DTEND:${utc(event.endsAt ?? event.startsAt ?? '')}`
        : `DTEND;VALUE=DATE:${dateValue(nextDay(event.date ?? ''))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      ...(event.description === null ? [] : [`DESCRIPTION:${escapeText(event.description)}`]),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function label(item: OverlayItem, names: ReadonlyMap<string, string>): string {
  const place = item.poi_id ? names.get(item.poi_id) : undefined;
  if (place !== undefined) return place;
  const category = (item.category ?? 'plan').replace(/_/g, ' ');
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** The member's calendar for a live feed token, or null (unknown, revoked, or no longer theirs). */
export async function loadFeed(
  tx: pg.PoolClient,
  tripId: string,
  token: string,
): Promise<FeedCalendar | null> {
  const { rows } = await tx.query<{
    user_id: string;
    current: string | null;
    name: string;
    tz: string | null;
  }>(
    `SELECT f.user_id, t.current_version_id AS current, coalesce(d.name, c.name) AS name,
            coalesce(t.tz, d.tz) AS tz
       FROM calendar_feed_tokens f
       JOIN trips t ON t.id = f.trip_id
       JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE f.token_hash = $1 AND f.trip_id = $2 AND f.revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM crew_members m
                     WHERE m.crew_id = t.crew_id AND m.user_id = f.user_id AND m.status = 'active')`,
    [tokenHash(token), tripId],
  );
  const feed = rows[0];
  if (feed === undefined) return null;
  if (feed.current === null) return { name: feed.name, tz: feed.tz, events: [] };
  const group = await loadPlanState(tx, feed.current);
  const personal = await tx.query<{ id: string; ops: unknown }>(
    `SELECT id, ops FROM personal_plan_ops
      WHERE trip_id = $1 AND user_id = $2 AND status = 'active' ORDER BY created_at`,
    [tripId, feed.user_id],
  );
  const plan = mergeOverlay(
    group,
    personal.rows.map((row) => ({
      id: row.id,
      ops: changeSetOpsSchema.parse(row.ops),
      status: 'active' as const,
    })),
    feed.user_id,
  );
  const mine = plan.items.filter(
    (item) =>
      item.just_you ||
      item.attendee_ids === undefined ||
      item.attendee_ids.length === 0 ||
      item.attendee_ids.includes(feed.user_id),
  );
  const poiIds = mine.flatMap((item) => (item.poi_id ? [item.poi_id] : []));
  const names = new Map(
    (
      await tx.query<{ id: string; name: string }>(
        'SELECT id, name FROM pois WHERE id = ANY ($1::uuid[])',
        [poiIds],
      )
    ).rows.map((row) => [row.id, row.name]),
  );
  const dates = new Map(group.days.map((day) => [day.day_no, day.date]));
  return {
    name: feed.name,
    tz: feed.tz,
    events: mine.map((item) => ({
      uid: item.stable_id,
      summary: label(item, names),
      description: item.notes ?? null,
      startsAt: item.starts_at ?? null,
      endsAt: item.ends_at ?? null,
      date: dates.get(item.day_no) ?? null,
    })),
  };
}
