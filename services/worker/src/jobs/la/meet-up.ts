/**
 * The meet-up (crew-live) loader, a Boost perk: every member of a boosted trip sees the crew
 * sliding toward the meet-up flag from half an hour before until everyone has arrived or half an
 * hour after the meet-up time. A lapsed Boost or a cancelled meet-up ends it with that reason as
 * the final frame. Arrivals and the meet-up time passing are the urgent frames.
 */
import {
  buildMeetUpLaAttributes,
  buildMeetUpLaState,
  LA_COPY,
  LA_MEET_UP_LEAD_MS,
  LA_MEET_UP_TAIL_MS,
  type MeetUpLaInput,
} from '@cp/domain';

import { clockIn, ROUTINE, type LaLoader } from './snapshot';

interface MeetUpRow {
  id: string;
  trip_id: string;
  place_name: string;
  meet_at: Date;
  status: 'active' | 'done' | 'cancelled';
  arrived: Record<string, string>;
  tz: string | null;
  boosted: boolean;
  created_by: string;
  /** Members who tapped ON MY WAY for this meet-up. */
  on_my_way: string[];
}

interface MemberRow {
  user_id: string;
  name: string | null;
  eta_min: number | null;
  distance_m: number | null;
}

const LINGER_MS = 10 * 60_000;

/** "2.4 km" or "600 m": how far out a straggler is, without saying where. */
function distanceLine(metres: number | null): string | null {
  if (metres === null) return null;
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 50) * 50} m`;
}

export const meetUpLoader: LaLoader = async ({ tx, refId, now, redact = false }) => {
  const { rows } = await tx.query<MeetUpRow>(
    `SELECT m.id, m.trip_id, m.place_name, m.meet_at, m.status, m.arrived,
            coalesce(t.tz, d.tz) AS tz, coalesce(e.boost_active, false) AS boosted, m.created_by,
            ARRAY(SELECT DISTINCT v.actor_id FROM domain_events v
                   WHERE v.aggregate_kind = 'trip' AND v.aggregate_id = m.trip_id
                     AND v.type = 'crew.pinged' AND v.actor_id IS NOT NULL
                     AND v.payload ->> 'kind' = 'on_my_way'
                     AND v.payload ->> 'meetup_id' = m.id::text) AS on_my_way
       FROM meetups m JOIN trips t ON t.id = m.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN trip_entitlements e ON e.trip_id = m.trip_id
      WHERE m.id = $1`,
    [refId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const members = await tx.query<MemberRow>(
    `SELECT p.user_id, u.display_name AS name, e.eta_min, e.distance_m
       FROM trip_participants p JOIN users u ON u.id = p.user_id
       LEFT JOIN member_etas e ON e.trip_id = p.trip_id AND e.user_id = p.user_id
                              AND e.meetup_id = $2
      WHERE p.trip_id = $1 AND p.holds_seat
      ORDER BY p.created_at, p.user_id`,
    [row.trip_id, row.id],
  );
  const meet = row.meet_at.getTime();
  const input: MeetUpLaInput = {
    meetupId: row.id,
    tripId: row.trip_id,
    // Hiding details on the lock screen: the meet-up's time and the crew show, never its place.
    placeName: redact ? '' : row.place_name,
    meetAt: row.meet_at,
    members: members.rows.map((m, i) => ({
      uid: m.user_id,
      name: m.name ?? '?',
      tone: i % 8,
      etaMin: m.eta_min,
      arrived: Object.hasOwn(row.arrived, m.user_id),
      statusText: distanceLine(m.distance_m),
    })),
    endReason: row.status === 'cancelled' ? 'cancelled' : !row.boosted ? 'boost_ended' : null,
  };
  const allIn = input.members.length > 0 && input.members.every((m) => m.arrived);
  const ended = input.endReason !== null || row.status === 'done' || allIn;
  const final: MeetUpLaInput =
    input.endReason === null && (allIn || row.status === 'done')
      ? { ...input, endReason: allIn ? 'all_arrived' : 'timed_out' }
      : input;
  const time = clockIn(row.meet_at, row.tz ?? 'UTC');
  return {
    tripId: row.trip_id,
    live:
      !ended &&
      now.getTime() >= meet - LA_MEET_UP_LEAD_MS &&
      now.getTime() < meet + LA_MEET_UP_TAIL_MS,
    audience: input.members.map((m) => m.uid),
    initiators: [row.created_by],
    optedIn: row.on_my_way,
    attributes: () => Promise.resolve(buildMeetUpLaAttributes(input)),
    state: (seq) => buildMeetUpLaState(final, now, seq),
    startAlert: {
      title: LA_COPY.meetUpStartTitle,
      body: LA_COPY.meetUpStartBody,
      vars: { place: row.place_name, time },
    },
    endsAt: new Date(meet + LA_MEET_UP_TAIL_MS),
    lingerMs: LINGER_MS,
    urgency: (prev, next) => {
      if (prev?.['state'] === next['state']) return ROUTINE;
      if (next['state'] === 'arrived') {
        return {
          priority: 10,
          alert: {
            title: LA_COPY.meetUpArrivedTitle,
            body: LA_COPY.meetUpArrivedBody,
            vars: { place: row.place_name },
          },
        };
      }
      if (next['state'] === 'late') {
        return {
          priority: 10,
          alert: {
            title: LA_COPY.meetUpLateTitle,
            body: LA_COPY.meetUpLateBody,
            vars: { place: row.place_name, time },
          },
        };
      }
      return ROUTINE;
    },
  };
};
