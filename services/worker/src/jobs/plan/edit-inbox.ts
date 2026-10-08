/**
 * An organiser's own edit to a locked plan (`apply_plan_ops`, no vote): everyone else going gets
 * one inbox entry naming what changed ("Linh added Sơn Trà · Wed 21 Oct, 12:45"), and crew chat
 * gets one line saying the same. Edits while the plan is still being built stay quiet: nobody has
 * said yes to it yet. The summary is read from the two versions, so it holds for every op kind.
 */
import {
  PLAN_CHANGE_CHAT_LINE,
  PLAN_CHANGE_INBOX_KIND,
  planChangeLineBody,
  type PlanChangeSummary,
  tripPlanLink,
} from '@cp/domain';
import type pg from 'pg';

import { registerInboxFanout, type FanoutEvent } from '../inbox/fanout';
import { localClock } from '../notify/policy';
import { str } from '../setup/facts';

const LOCKED = ['confirmed', 'pre_trip', 'in_trip'];

interface Diff {
  readonly change: 'add' | 'move' | 'remove';
  readonly title: string;
  readonly date: string | null;
  readonly starts_at: Date | null;
  readonly tz: string;
}

const hhmm = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** What the edit changed, comparing each stop of the new version with its base. */
async function summarise(
  tx: pg.PoolClient,
  event: FanoutEvent,
): Promise<{ tripId: string; summary: PlanChangeSummary } | null> {
  const tripId = str(event, 'trip_id');
  const versionId = str(event, 'version_id');
  const baseId = str(event, 'base_version_id');
  if (tripId === null || versionId === null || baseId === null) return null;
  if (event.payload['source'] !== 'ops' || event.actorId === null) return null;
  const { rows } = await tx.query<Diff>(
    `WITH items AS (
       SELECT i.version_id, i.stable_id, i.starts_at, i.ends_at, i.tz, d.day_no, d.date,
              coalesce(p.name, i.custom_place->>'name', i.notes, '') AS title
         FROM plan_items i JOIN plan_days d ON d.id = i.day_id
         LEFT JOIN pois p ON p.id = i.poi_id
        WHERE i.version_id IN ($2, $3)),
     after AS (SELECT * FROM items WHERE version_id = $2),
     before AS (SELECT * FROM items WHERE version_id = $3)
     SELECT CASE WHEN b.stable_id IS NULL THEN 'add' WHEN a.stable_id IS NULL THEN 'remove'
                 ELSE 'move' END AS change,
            coalesce(a.title, b.title) AS title,
            coalesce(a.date, b.date)::text AS date,
            coalesce(a.starts_at, b.starts_at) AS starts_at,
            coalesce(a.tz, b.tz, t.tz, dest.tz, 'UTC') AS tz
       FROM after a FULL JOIN before b ON b.stable_id = a.stable_id
       JOIN trips t ON t.id = $1 AND t.status = ANY ($4::text[])
       LEFT JOIN destinations dest ON dest.id = t.destination_id
      WHERE a.stable_id IS NULL OR b.stable_id IS NULL
         OR a.day_no IS DISTINCT FROM b.day_no OR a.starts_at IS DISTINCT FROM b.starts_at
         OR a.ends_at IS DISTINCT FROM b.ends_at
      ORDER BY CASE WHEN b.stable_id IS NULL THEN 0 WHEN a.stable_id IS NULL THEN 2 ELSE 1 END,
               coalesce(a.starts_at, b.starts_at)`,
    [tripId, versionId, baseId, LOCKED],
  );
  const first = rows[0];
  if (first === undefined) return null;
  let date = first.date;
  let time: string | null = null;
  if (first.starts_at !== null) {
    const clock = localClock(first.starts_at, first.tz);
    date = clock.date;
    time = hhmm(clock.minutes);
  }
  return {
    tripId,
    summary: { op: first.change, title: first.title, date, time, count: rows.length },
  };
}

function chatLine(summary: PlanChangeSummary): string {
  if (summary.count !== 1 || summary.title === '') return PLAN_CHANGE_CHAT_LINE.edited;
  if (summary.op === 'add') return PLAN_CHANGE_CHAT_LINE.editAdded;
  if (summary.op === 'remove') return PLAN_CHANGE_CHAT_LINE.editRemoved;
  return PLAN_CHANGE_CHAT_LINE.editMoved;
}

/** Registers the entry and the chat line for an organiser's edit to the locked plan. */
export function registerPlanEditFanout(): void {
  registerInboxFanout({
    kind: PLAN_CHANGE_INBOX_KIND.edited,
    async audience(tx, event) {
      const edit = await summarise(tx, event);
      if (edit === null) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted') AND user_id <> $2
          ORDER BY user_id`,
        [edit.tripId, event.actorId],
      );
      if (rows.length === 0) return [];
      // One line per edit: a replayed event finds its entries already filed and posts nothing.
      await tx.query(
        `INSERT INTO messages (crew_id, trip_id, sender_kind, type, ref_kind, ref_id, body)
         SELECT t.crew_id, t.id, 'system', 'system', $2, $3, $4 FROM trips t
          WHERE t.id = $1
            AND NOT EXISTS (SELECT 1 FROM inbox_items WHERE source_event_id = $5)`,
        [
          edit.tripId,
          chatLine(edit.summary),
          event.actorId,
          planChangeLineBody(edit.summary),
          event.id,
        ],
      );
      return rows.map((row) => row.user_id);
    },
    async build(tx, event) {
      const edit = await summarise(tx, event);
      if (edit === null) return null;
      return {
        tripId: edit.tripId,
        actorId: event.actorId,
        data: { trip_id: edit.tripId, version_id: str(event, 'version_id'), ...edit.summary },
        deepLink: tripPlanLink(edit.tripId),
      };
    },
  });
}
