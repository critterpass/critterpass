/**
 * The leave-by loader: the crew's trail from three hours before leave time until it is walked.
 * Everyone on the leave-by gets it (their own activity is free, with every crewmate's pip); leave
 * time and a late crew are the only urgent frames (priority 10 with an alert, a sound at leave
 * time), everything else rides the power-considerate budget. A leave-by with no travel leg is a
 * time to be somewhere: its time, countdown and alerts say "be at" instead of "leave by".
 */
import {
  buildLeaveByLaAttributes,
  buildLeaveByLaState,
  LA_COPY,
  LA_LEAVE_BY_LEAD_MS,
  leaveByLaTrailMs,
  type LeaveByLaInput,
  type LeaveByState,
  type ReadinessState,
} from '@cp/domain';
import { arriveEarlyMinutes } from '@cp/planner';

import { clockIn, ROUTINE, type LaLoader } from './snapshot';

interface LeaveByRow {
  id: string;
  trip_id: string;
  title: string;
  place_name: string | null;
  leave_at: Date;
  tz: string;
  state: LeaveByState;
  legs: { minutes?: number }[];
  pickup: { place?: string | null } | null;
  guide_note: string | null;
  participant_ids: string[];
  guide: string | null;
  starts_at: Date;
  leg_kind: string | null;
  category: string | null;
  dep_airport: string | null;
}

/** An ended leave-by's last frame stays this long ("done", or the crew still walking). */
const LINGER_MS = 15 * 60_000;

export const leaveByLoader: LaLoader = async ({ tx, refId, now, render }) => {
  const { rows } = await tx.query<LeaveByRow>(
    `SELECT l.id, l.trip_id, l.title, l.place_name, l.leave_at, l.tz, l.state, l.legs, l.pickup,
            l.guide_note, (SELECT g.slug FROM trips t JOIN guides g ON g.id = t.guide_id
                            WHERE t.id = l.trip_id) AS guide,
            l.starts_at, l.legs->0->>'kind' AS leg_kind, i.category,
            (SELECT s.dep_airport::text FROM flight_segments s
              WHERE s.booking_id = i.booking_id AND s.sched_dep_at = l.starts_at
              ORDER BY s.segment_no LIMIT 1) AS dep_airport,
            CASE WHEN cardinality(l.participant_ids) > 0 THEN l.participant_ids
                 ELSE ARRAY(SELECT user_id FROM trip_participants
                             WHERE trip_id = l.trip_id AND holds_seat ORDER BY created_at, user_id)
            END AS participant_ids
       FROM leave_bys l LEFT JOIN plan_items i ON i.id = l.plan_item_id WHERE l.id = $1`,
    [refId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const readiness = await tx.query<{ user_id: string; state: ReadinessState }>(
    'SELECT user_id, state FROM readiness WHERE leave_by_id = $1',
    [refId],
  );
  const stateOf = new Map(readiness.rows.map((r) => [r.user_id, r.state]));
  // No travel leg: nothing says where the crew sets off from, so no trip is counted and the
  // activity shows where to be and by when (the departure airport and check-in time for a flight,
  // the place and the start otherwise), as the leave-by's pushes do.
  const beThere =
    row.leg_kind === 'none'
      ? {
          place: row.dep_airport ?? row.place_name ?? row.title,
          at: new Date(row.starts_at.getTime() - arriveEarlyMinutes(row.category) * 60_000),
        }
      : null;
  const place = beThere?.place ?? row.place_name ?? row.title;
  const leaveAt = beThere?.at ?? row.leave_at;
  const [stay, pickup, beAt] = await Promise.all([
    render('en', LA_COPY.stay),
    render('en', LA_COPY.pickup),
    beThere === null ? null : render('en', LA_COPY.leaveByBeAt, { place }),
  ]);
  const input = (labels: { stay: string; pickup: string }): LeaveByLaInput => ({
    leaveById: row.id,
    tripId: row.trip_id,
    title: row.title === '' ? (row.place_name ?? '') : row.title,
    placeName: beThere?.place ?? row.place_name,
    pickupPlace: row.pickup?.place ?? null,
    hasPickup: row.pickup !== null,
    leaveAt,
    beThereLine: beAt,
    state: row.state,
    legMinutes: row.legs.map((leg) => leg.minutes ?? 0),
    participants: row.participant_ids.map((uid) => ({
      uid,
      readiness: stateOf.get(uid) ?? 'not_up',
    })),
    guideLine: row.guide_note ?? '',
    labels,
    guide: row.guide,
  });
  const shared = input({ stay, pickup });
  const leave = leaveAt.getTime();
  const trailEnds = new Date(leave + leaveByLaTrailMs(shared));
  const counts = () => {
    const up = shared.participants.filter((p) => p.readiness !== 'not_up').length;
    return { up, total: shared.participants.length };
  };
  return {
    tripId: row.trip_id,
    live:
      row.state !== 'cancelled' &&
      now.getTime() >= leave - LA_LEAVE_BY_LEAD_MS &&
      now.getTime() < trailEnds.getTime(),
    audience: row.participant_ids,
    attributes: async (locale) =>
      buildLeaveByLaAttributes(
        input({
          stay: await render(locale, LA_COPY.stay),
          pickup: await render(locale, LA_COPY.pickup),
        }),
      ),
    state: (seq) => buildLeaveByLaState(shared, now, seq),
    startAlert: {
      title: beThere === null ? LA_COPY.leaveByStartTitle : LA_COPY.leaveByBeThereStartTitle,
      body: LA_COPY.leaveByStartBody,
      vars: { time: clockIn(leaveAt, row.tz), place, ...counts() },
    },
    endsAt: trailEnds,
    lingerMs: row.state === 'cancelled' ? 0 : LINGER_MS,
    urgency: (prev, next) => {
      if (prev?.['state'] === next['state']) return ROUTINE;
      const { up, total } = counts();
      if (next['state'] === 'go') {
        return {
          priority: 10,
          alert: {
            title: beThere === null ? LA_COPY.leaveByGoTitle : LA_COPY.leaveByBeThereGoTitle,
            body: beThere === null ? LA_COPY.leaveByGoBody : LA_COPY.leaveByBeThereGoBody,
            vars: { place, up, total },
            sound: true,
          },
        };
      }
      if (next['state'] === 'late') {
        return {
          priority: 10,
          alert: {
            title: LA_COPY.leaveByLateTitle,
            body: LA_COPY.leaveByLateBody,
            vars: { place, missing: total - up },
          },
        };
      }
      return ROUTINE;
    },
  };
};
