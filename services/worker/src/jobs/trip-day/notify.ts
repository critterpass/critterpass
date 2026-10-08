/**
 * Trip day pushes: the crew knock to members already up (ALWAYS), the remote copy of a leave-by
 * alarm for members whose phone never confirmed one (ALWAYS, time-sensitive), a member running
 * late to the rest of the trip (the crew ping) and the morning briefing's one push (budgeted). The
 * leave-by pushes take their words from `leaveByPushCopy`: a time to leave, or a time to be there
 * when no trip to the place was counted.
 */
import { crewChatLink, TRIP_DAY_PUSH, tripDayLink, tripHubLink } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';
import { leaveByPushCopy, type LeaveByPushFacts } from './leave-by-push-copy';

interface LeaveByFacts extends LeaveByPushFacts {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly local_date: string;
}

async function leaveBy(tx: pg.PoolClient, routed: RoutedEvent): Promise<LeaveByFacts | undefined> {
  const { rows } = await tx.query<LeaveByFacts>(
    `SELECT l.trip_id, t.crew_id, l.title, l.place_name, l.starts_at, l.leave_at, l.tz,
            l.local_date::text AS local_date, l.legs->0->>'kind' AS leg_kind, i.category,
            (SELECT s.dep_airport::text FROM flight_segments s
              WHERE s.booking_id = i.booking_id AND s.sched_dep_at = l.starts_at
              ORDER BY s.segment_no LIMIT 1) AS dep_airport
       FROM leave_bys l JOIN trips t ON t.id = l.trip_id
       LEFT JOIN plan_items i ON i.id = l.plan_item_id
      WHERE l.id = $1`,
    [str(routed, 'leave_by_id')],
  );
  return rows[0];
}

/**
 * What the briefing push's lock-screen buttons act on: the line the push reads out, and the one
 * button that line takes (DONE or NUDGE; none for a line that only opens the app or sets a value).
 */
export function briefingContext(item: { readonly id: string; readonly action: string }): {
  readonly item_id: string;
  readonly actions: readonly ('DONE' | 'NUDGE')[];
} {
  const actions =
    item.action === 'done'
      ? (['DONE'] as const)
      : item.action === 'nudge'
        ? (['NUDGE'] as const)
        : [];
  return { item_id: item.id, actions };
}

function uuids(routed: RoutedEvent, key: string): string[] {
  const value = routed.payload[key];
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export function registerTripDayNotifications(): void {
  registerNotification({
    key: 'crew_knock',
    event: 'leave_by.knocked',
    audience: async (tx, routed) => {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM readiness
          WHERE leave_by_id = $1 AND state <> 'not_up' AND user_id <> $2 ORDER BY user_id`,
        [str(routed, 'leave_by_id'), str(routed, 'user_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const facts = await leaveBy(tx, routed);
      if (facts === undefined) return null;
      const sleeper = str(routed, 'user_id') ?? '';
      const copy = leaveByPushCopy(facts);
      return {
        title: copy.knockTitle,
        body: TRIP_DAY_PUSH.knockBody,
        vars: { place: copy.place, time: copy.time, name: await firstName(tx, sleeper) },
        sender: { kind: 'member', id: sleeper, name: await firstName(tx, sleeper) },
        crewId: facts.crew_id,
        tripId: facts.trip_id,
        deepLink: tripDayLink(facts.trip_id, facts.local_date),
        collapseVars: { leave_by_id: str(routed, 'leave_by_id') ?? '' },
      };
    },
    dedupeKey: (routed, uid) =>
      `crew_knock:${str(routed, 'leave_by_id') ?? ''}:${str(routed, 'user_id') ?? ''}:${uid}`,
  });
  registerNotification({
    key: 'leave_by_alarm',
    event: 'leave_by.alarm_due',
    audience: (_tx, routed) => Promise.resolve(uuids(routed, 'user_ids')),
    async compose(tx, routed) {
      const facts = await leaveBy(tx, routed);
      if (facts === undefined) return null;
      const copy = leaveByPushCopy(facts);
      return {
        title: copy.alarmTitle,
        body: copy.alarmBody,
        vars: { place: copy.place, time: copy.time },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: facts.crew_id,
        tripId: facts.trip_id,
        deepLink: tripDayLink(facts.trip_id, facts.local_date),
        classContext: { remote: true },
        collapseVars: { leave_by_id: str(routed, 'leave_by_id') ?? '' },
      };
    },
  });
  registerNotification({
    key: 'crew_ping',
    event: 'member.running_late',
    audience: async (tx, routed) => {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND user_id <> $2 AND rsvp NOT IN ('out', 'waitlisted')
          ORDER BY user_id`,
        [str(routed, 'trip_id'), str(routed, 'user_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const late = str(routed, 'user_id') ?? '';
      const { rows } = await tx.query<{ crew_id: string; crew: string }>(
        'SELECT t.crew_id, c.name AS crew FROM trips t JOIN crews c ON c.id = t.crew_id WHERE t.id = $1',
        [str(routed, 'trip_id')],
      );
      const trip = rows[0];
      if (trip === undefined) return null;
      const name = await firstName(tx, late);
      return {
        title: TRIP_DAY_PUSH.lateTitle,
        body: TRIP_DAY_PUSH.lateBody,
        vars: { crew: trip.crew, name, minutes: Number(routed.payload['minutes'] ?? 0) },
        sender: { kind: 'member', id: late, name },
        crewId: trip.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: crewChatLink(trip.crew_id),
      };
    },
  });
  registerNotification({
    key: 'morning_briefing',
    event: 'briefing.built',
    audience: (_tx, routed) =>
      Promise.resolve(
        Number(routed.payload['item_count'] ?? 0) > 0 ? [str(routed, 'user_id') ?? ''] : [],
      ),
    async compose(tx, routed) {
      const { rows } = await tx.query<{
        id: string;
        text: string;
        action: string;
        crew_id: string;
        place: string | null;
      }>(
        `SELECT i.id, i.text, i.action, t.crew_id, d.name AS place
           FROM briefing_items i JOIN trips t ON t.id = i.trip_id
           LEFT JOIN destinations d ON d.id = t.destination_id
          WHERE i.briefing_id = $1 AND i.status = 'open' ORDER BY i.position LIMIT 1`,
        [str(routed, 'briefing_id')],
      );
      const first = rows[0];
      if (first === undefined) return null;
      return {
        title: TRIP_DAY_PUSH.briefingTitle,
        body: TRIP_DAY_PUSH.briefingBody,
        vars: { place: first.place ?? '', line: first.text },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: first.crew_id,
        tripId: str(routed, 'trip_id') ?? null,
        deepLink: tripHubLink(str(routed, 'trip_id') ?? ''),
        ctx: briefingContext(first),
        collapseVars: { trip_id: str(routed, 'trip_id') ?? '' },
      };
    },
  });
}
