/**
 * `ai.fit_check` (docs/api-contracts-async.md §2.2): every live must-do of a trip checked against
 * the trip's dates by the planner — the place's opening hours on those dates around the fixed
 * skeleton (arrival morning, departure afternoon), for the time it needs — giving fits / tight /
 * clash, or unknown before the dates are locked or without hours (never a day number before a
 * draft). Every row it has looked at with the dates locked is stamped `fit_checked_at`, an
 * unknown verdict included, so the app can tell "no verdict" from "still checking". Catalogue tags mark what books out (`book_ahead:<days>`) or runs a lottery (`lottery`).
 * Only then does the guide write the one-line note (fast tier `must_do.fit_line`, template when
 * switched off), from the place, the verdict and public facts alone. Changed rows reach the crew as
 * `must_do.row`. System AI: unmetered. First, a typed must-do without a place is decided once
 * (./must-do-place.ts): the place it means, if our search has it, and its time of day.
 */
import type { FitNoteInput, FitNoteReason, FitNoteResult } from '@cp/ai';
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  hoursSchema,
  SETUP_QUEUES,
  SETUP_RT,
  stopDayRanges,
  WEEKDAYS,
} from '@cp/domain';
import { datesOf, preDraftFit, type FitStatus } from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { setupFacts } from '../setup/facts';
import { resolveTypedMustDos, type MustDoDecisions } from './must-do-place';

export const fitCheckSchema = z.object({ trip_id: z.uuid() });
export type FitCheckJob = z.infer<typeof fitCheckSchema>;

export type FitNoteWriter = (input: FitNoteInput) => Promise<FitNoteResult>;

const DEFAULT_DURATION_MIN = 120;
const ARRIVAL_BUSY = { startMin: 0, endMin: 14 * 60 };
const DEPARTURE_BUSY = { startMin: 12 * 60, endMin: 24 * 60 };

interface MustDoRow {
  readonly id: string;
  readonly title: string;
  readonly poi_name: string | null;
  readonly hours: unknown;
  readonly tags: string[] | null;
  readonly time_needed_min: number | null;
  readonly fit_status: string;
  readonly fit_note: string | null;
  readonly fit_checked_at: string | null;
  readonly external_action: string;
  readonly external_deadline: string | null;
  /** The later stop whose city the place lies in; null for the first stop's, or for none. */
  readonly stop_position?: number | null;
}

/** The dates a must-do is checked on, and whether the last of them is the day the crew leaves. */
export interface CheckedDates {
  readonly dates: readonly string[];
  readonly leaves: boolean;
}

/**
 * The dates a must-do can happen on: a place in a later stop's city only on that stop's days (its
 * first is the day the crew arrives, its last a full day unless the trip ends there); any other
 * place on every date of the trip, as on a trip of one stop.
 */
export function datesForStop(
  dates: readonly string[],
  stops: readonly { readonly position: number; readonly nights: number }[],
  position: number | null | undefined,
): CheckedDates {
  const index = position == null ? -1 : stops.findIndex((stop) => stop.position === position);
  const range = index < 1 ? undefined : stopDayRanges(stops, dates.length)[index];
  if (range === undefined) return { dates, leaves: true };
  return { dates: dates.slice(range.first - 1, range.last), leaves: range.last >= dates.length };
}

export interface MustDoVerdict {
  readonly status: FitStatus;
  readonly reason: FitNoteReason;
  readonly hours: string | undefined;
  readonly leadDays: number | undefined;
  readonly externalAction: 'lottery' | 'book_ahead' | 'none';
  readonly externalDeadline: string | null;
}

function leadDaysOf(tags: readonly string[]): number | undefined {
  for (const tag of tags) {
    const match = /^book_ahead:(\d{1,3})$/u.exec(tag);
    if (match?.[1] !== undefined) return Number(match[1]);
  }
  return tags.includes('book_ahead') ? 14 : undefined;
}

function hoursText(hours: unknown, date: string | undefined): string | undefined {
  const parsed = hoursSchema.safeParse(hours);
  if (!parsed.success || date === undefined) return undefined;
  const isoDow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const spans = parsed.data.weekly[WEEKDAYS[isoDow] ?? 'mo'] ?? [];
  return spans.length === 0 ? undefined : spans.map((s) => `${s.start}–${s.end}`).join(', ');
}

/** The planner's verdict for one must-do on the trip's dates (empty before they are locked). */
export function judgeMustDo(
  row: MustDoRow,
  dates: readonly string[],
  start: string | null,
  leaves = true,
): MustDoVerdict {
  const parsed = row.hours === null ? null : hoursSchema.safeParse(row.hours);
  const hours =
    parsed?.success === true && Object.keys(parsed.data.weekly).length > 0 ? parsed.data : null;
  const busy: Record<string, { startMin: number; endMin: number }[]> = {};
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first !== undefined) busy[first] = [ARRIVAL_BUSY];
  if (leaves && last !== undefined && last !== first) busy[last] = [DEPARTURE_BUSY];
  const status = preDraftFit({
    hours,
    durationMin: row.time_needed_min ?? DEFAULT_DURATION_MIN,
    dates,
    busy,
  });
  const tags = row.tags ?? [];
  const lottery = tags.includes('lottery');
  const leadDays = leadDaysOf(tags);
  const bookBy =
    leadDays !== undefined && start !== null
      ? new Date(Date.parse(`${start}T00:00:00Z`) - leadDays * 86_400_000)
          .toISOString()
          .slice(0, 10)
      : null;
  const externalAction = lottery ? 'lottery' : leadDays !== undefined ? 'book_ahead' : 'none';
  const reason: FitNoteReason =
    status === 'clash'
      ? 'closed_on_dates'
      : leadDays !== undefined || lottery
        ? 'books_out'
        : status === 'tight'
          ? 'short_window'
          : 'open';
  return {
    status,
    reason,
    hours: hoursText(row.hours, dates[1] ?? first),
    leadDays,
    externalAction,
    externalDeadline:
      externalAction === 'lottery'
        ? row.external_deadline
        : externalAction === 'book_ahead'
          ? bookBy
          : null,
  };
}

/**
 * The stop a must-do's place lies in, when that is not the first: the stop whose city owns the
 * place or whose place box holds it (the smallest box first, as a trip's areas claim places).
 */
const STOP_OF_PLACE_SQL = `(
  SELECT CASE WHEN s.position > 1 THEN s.position END
    FROM trip_stops s JOIN destinations d ON d.id = s.destination_id
   WHERE s.trip_id = m.trip_id
     AND (p.destination_id = d.id OR ST_Intersects(p.location, d.place_bounds))
   ORDER BY ST_Intersects(p.location, d.place_bounds) DESC NULLS LAST,
            ST_Area(d.place_bounds) NULLS LAST, s.position
   LIMIT 1)`;

export async function checkTripFits(
  pool: pg.Pool,
  tripId: string,
  write: FitNoteWriter,
  decisions?: MustDoDecisions,
): Promise<{ checked: number; changed: number }> {
  if (decisions !== undefined) await resolveTypedMustDos(pool, tripId, decisions);
  const loaded = await withSystem(pool, async (tx) => {
    const trip = await tx.query<{ start_date: string | null; end_date: string | null }>(
      'SELECT start_date::text AS start_date, end_date::text AS end_date FROM trips WHERE id = $1',
      [tripId],
    );
    const rows = await tx.query<MustDoRow>(
      `SELECT m.id, m.title, p.name AS poi_name, p.hours, p.tags,
              (p.editorial->>'time_needed_min')::int AS time_needed_min, m.fit_status, m.fit_note,
              m.fit_checked_at::text AS fit_checked_at, m.external_action, m.external_deadline::text AS external_deadline,
              ${STOP_OF_PLACE_SQL} AS stop_position
         FROM must_dos m LEFT JOIN pois p ON p.id = m.poi_id
        WHERE m.trip_id = $1 AND m.deleted_at IS NULL ORDER BY m.created_at`,
      [tripId],
    );
    const stops = await tx.query<{ position: number; nights: number }>(
      'SELECT position, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position',
      [tripId],
    );
    return {
      trip: trip.rows[0],
      rows: rows.rows,
      stops: stops.rows,
      facts: await setupFacts(tx, tripId),
    };
  });
  if (loaded.trip === undefined || loaded.facts === undefined) return { checked: 0, changed: 0 };
  const { start_date: start, end_date: end } = loaded.trip;
  const dates =
    start === null || end === null
      ? []
      : datesOf(start, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);
  const updates: { row: MustDoRow; verdict: MustDoVerdict; note: string | null }[] = [];
  /** Rows whose verdict stands but which were never stamped as looked at. */
  const looked: MustDoRow[] = [];
  for (const row of loaded.rows) {
    const on = datesForStop(dates, loaded.stops, row.stop_position);
    const verdict = judgeMustDo(row, on.dates, start, on.leaves);
    const needsNote = verdict.status !== 'unknown';
    const unchanged =
      row.fit_status === verdict.status &&
      row.external_action === verdict.externalAction &&
      row.external_deadline === verdict.externalDeadline &&
      (row.fit_note !== null) === needsNote;
    if (unchanged) {
      if (row.fit_checked_at === null && dates.length > 0) looked.push(row);
      continue;
    }
    const note = needsNote
      ? (
          await write({
            guide: loaded.facts.persona,
            place: row.poi_name ?? row.title,
            status: verdict.status,
            reason: verdict.reason,
            ...(verdict.hours === undefined ? {} : { hours: verdict.hours }),
            ...(verdict.leadDays === undefined ? {} : { leadDays: verdict.leadDays }),
          })
        ).note
      : null;
    updates.push({ row, verdict, note });
  }
  if (updates.length === 0 && looked.length === 0) {
    return { checked: loaded.rows.length, changed: 0 };
  }
  await withSystem(pool, async (tx) => {
    for (const row of looked) {
      // The row itself syncs; no realtime hint, the verdict has not changed.
      await tx.query(
        `UPDATE must_dos SET fit_checked_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND title = $2 AND fit_checked_at IS NULL`,
        [row.id, row.title],
      );
    }
    for (const { row, verdict, note } of updates) {
      const { rowCount } = await tx.query(
        `UPDATE must_dos
            SET fit_status = $2, fit_note = $3, target_day = NULL, external_action = $4,
                external_deadline = $5, fit_checked_at = now()
          WHERE id = $1 AND deleted_at IS NULL AND title = $6`,
        [row.id, verdict.status, note, verdict.externalAction, verdict.externalDeadline, row.title],
      );
      if (rowCount === 0) continue;
      await outbox(tx, channelName('trip_setup', tripId), SETUP_RT.mustDoRow, {
        must_do_id: row.id,
        fit_status: verdict.status,
      });
      await appendDomainEvent(tx, {
        type: 'must_do.fit_checked',
        aggregateKind: 'must_do',
        aggregateId: row.id,
        actorKind: 'guide',
        actorId: null,
        tripId,
        payload: { trip_id: tripId, must_do_id: row.id, fit_status: verdict.status },
      });
    }
  });
  return { checked: loaded.rows.length, changed: updates.length };
}

export function fitCheckJob(
  write: FitNoteWriter,
  decisions?: MustDoDecisions,
): JobDefinition<FitCheckJob> {
  return defineJob({
    queue: SETUP_QUEUES.fitCheck,
    schema: fitCheckSchema,
    singletonKey: (data) => data.trip_id,
    handler: async (data, ctx) => ({
      ...(await checkTripFits(ctx.pool, data.trip_id, write, decisions)),
    }),
  });
}
