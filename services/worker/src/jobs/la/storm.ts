/**
 * The storm loader: a weather, sea or volcano watch that threatens a trip day goes on the crew's
 * lock screens from the evening before until that day ends, with how serious it is (WATCHING, or a
 * warning once the plan needs a plan B), the day it covers and the watch list's own words for what
 * to do. It ends as "passed" when the day is over, or as soon as the watch clears or the crew has
 * settled the plan. Crowds, traffic and closures are not storms and never get one.
 */
import { buildStormLaAttributes, buildStormLaState, LA_COPY, type StormLaInput } from '@cp/domain';

import { ROUTINE, type LaLoader } from './snapshot';

export const LA_STORM_KINDS = ['weather', 'marine', 'volcano'] as const;
/** The activity starts this long before the watched day begins (in the trip's zone). */
export const LA_STORM_LEAD_MS = 12 * 3_600_000;
const LINGER_MS = 30 * 60_000;

interface WatchRow {
  id: string;
  trip_id: string;
  status: 'go' | 'watching' | 'plan_b' | 'set';
  title: string;
  detail: string;
  resolved_at: Date | null;
  window_start: Date;
  window_end: Date;
}

export const stormLoader: LaLoader = async ({ tx, refId, now, render, redact }) => {
  const { rows } = await tx.query<WatchRow>(
    `SELECT w.id, w.trip_id, w.status, w.title, w.detail, w.resolved_at,
            (w.day::timestamp AT TIME ZONE coalesce(t.tz, 'UTC')) AS window_start,
            ((w.day + 1)::timestamp AT TIME ZONE coalesce(t.tz, 'UTC')) AS window_end
       FROM watch_items w JOIN trips t ON t.id = w.trip_id
      WHERE w.id = $1 AND w.kind = ANY($2::text[])`,
    [refId, LA_STORM_KINDS],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const crew = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants WHERE trip_id = $1 AND holds_seat
      ORDER BY created_at, user_id`,
    [row.trip_id],
  );
  const threatening =
    row.resolved_at === null && (row.status === 'watching' || row.status === 'plan_b');
  // The watch list's words may name a place; the plain lines never do.
  const [headline, actionLine] =
    redact === true
      ? await Promise.all([
          render('en', LA_COPY.stormPlainHeadline),
          render('en', LA_COPY.stormPlainAction),
        ])
      : [row.title, row.detail];
  const input: StormLaInput = {
    tripId: row.trip_id,
    watchId: row.id,
    severity: row.status === 'watching' ? 'watch' : 'warning',
    windowStart: row.window_start,
    windowEnd: row.window_end,
    headline,
    actionLine,
  };
  const at = now.getTime();
  return {
    tripId: row.trip_id,
    live:
      threatening &&
      at >= row.window_start.getTime() - LA_STORM_LEAD_MS &&
      at < row.window_end.getTime(),
    audience: crew.rows.map((member) => member.user_id),
    attributes: () => Promise.resolve(buildStormLaAttributes(input)),
    state: (seq) => ({
      ...buildStormLaState(input, now, seq),
      ...(threatening ? {} : { state: 'passed' as const }),
    }),
    startAlert: {
      title: LA_COPY.stormStartTitle,
      body: LA_COPY.stormStartBody,
      vars: { headline, action: actionLine },
    },
    endsAt: row.window_end,
    lingerMs: LINGER_MS,
    urgency: () => ROUTINE,
  };
};
