/**
 * `trips.lifecycle` (every 10 minutes): the time-driven trip moves of docs/data-model-sync-and-
 * privacy.md §3.1, each at a wall-clock boundary in the trip's own time zone (the trip's `tz`, else
 * its destination's, else UTC):
 *
 * - `proposed → confirmed` once the sent proposal's reply-by has passed with at least one member IN;
 * - `confirmed → pre_trip` from 00:00 fourteen days before the first day (at once for a trip
 *   confirmed later than that);
 * - `pre_trip → in_trip` at 12:00 on the first day when no landing, arrival or organiser has
 *   started it (a trip without flight data would otherwise never start);
 * - `in_trip → post_trip` at the midnight after the last day;
 * - `post_trip → archived` at the end of the boost and first-trip-free window (last day + 7 days,
 *   the same instant as `app.boost_window_end`).
 *
 * The rules run in lifecycle order, so a trip that fell behind catches up in one run. Each move is
 * its own transaction through `moveTripStatus` (compare-and-set, the status guard trigger and the
 * `trip.status_changed` event), so a rerun, or a signal that moved the trip first, changes nothing.
 * Voting, setup-stage, cancelled and archived trips match no rule.
 */
import { moveTripStatus, withSystem } from '@cp/db';
import { TRIP_LIFECYCLE_QUEUES, type TripStatus } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';

/** How many trips one rule moves per run; the next run picks up any rest. */
const BATCH = 500;

/** The trip's clock: its own zone, else its destination's, else UTC. */
const TZ = "coalesce(t.tz, d.tz, 'UTC')";

/** Local midnight `days` after `column`, as an instant. */
const localMidnight = (column: string, days: number) =>
  `((${column} + ${days})::timestamp AT TIME ZONE ${TZ})`;

interface LifecycleRule {
  readonly from: TripStatus;
  readonly to: TripStatus;
  /** SQL over `t` (trips) and `d` (destinations); `$1` is now. */
  readonly due: string;
}

export const LIFECYCLE_RULES: readonly LifecycleRule[] = [
  {
    from: 'proposed',
    to: 'confirmed',
    due: `EXISTS (SELECT 1 FROM proposals p
                   WHERE p.trip_id = t.id AND p.status = 'sent' AND p.reply_by <= $1)
          AND EXISTS (SELECT 1 FROM trip_participants tp WHERE tp.trip_id = t.id AND tp.rsvp = 'in')`,
  },
  {
    from: 'confirmed',
    to: 'pre_trip',
    due: `t.start_date IS NOT NULL AND ${localMidnight('t.start_date', -14)} <= $1`,
  },
  {
    from: 'pre_trip',
    to: 'in_trip',
    due: `t.start_date IS NOT NULL
          AND ((t.start_date::timestamp + interval '12 hours') AT TIME ZONE ${TZ}) <= $1`,
  },
  {
    from: 'in_trip',
    to: 'post_trip',
    due: `t.end_date IS NOT NULL AND ${localMidnight('t.end_date', 1)} <= $1`,
  },
  {
    from: 'post_trip',
    to: 'archived',
    due: `t.end_date IS NOT NULL AND ${localMidnight('t.end_date', 8)} <= $1`,
  },
];

export type LifecycleMoves = Readonly<Record<string, number>>;

/** Applies every due move once; resolves to how many trips each `from→to` moved. */
export async function runTripLifecycle(
  pool: pg.Pool,
  now: Date = new Date(),
): Promise<LifecycleMoves> {
  const moves: Record<string, number> = {};
  for (const rule of LIFECYCLE_RULES) {
    const due = await withSystem(pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT t.id FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id
          WHERE t.status = $2 AND ${rule.due}
          ORDER BY t.id LIMIT $3`,
        [now, rule.from, BATCH],
      );
      return rows.map((row) => row.id);
    });
    let moved = 0;
    for (const tripId of due) {
      const done = await withSystem(pool, (tx) =>
        moveTripStatus(tx, { tripId, from: rule.from, to: rule.to, actor: { kind: 'system' } }),
      );
      if (done) moved += 1;
    }
    moves[`${rule.from}->${rule.to}`] = moved;
  }
  return moves;
}

export function tripLifecycleJob(): AnyJobDefinition {
  return defineJob({
    queue: TRIP_LIFECYCLE_QUEUES.sweep,
    schema: z.object({}).nullish(),
    async handler(_data, { pool }) {
      return { ...(await runTripLifecycle(pool)) };
    },
  });
}
