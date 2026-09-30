/**
 * Trip day pushes: the crew knock to members already up (ALWAYS), the remote copy of a leave-by
 * alarm for members whose phone never confirmed one (ALWAYS, time-sensitive), a member running
 * late to the rest of the trip (the crew ping) and the morning briefing's one push (budgeted).
 */
import { TRIP_DAY_PUSH } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';

interface LeaveByFacts {
  readonly trip_id: string;
  readonly crew_id: string;
  readonly title: string;
  readonly place_name: string | null;
  readonly leave_at: Date;
  readonly tz: string;
  readonly local_date: string;
}

async function leaveBy(tx: pg.PoolClient, routed: RoutedEvent): Promise<LeaveByFacts | undefined> {
  const { rows } = await tx.query<LeaveByFacts>(
    `SELECT l.trip_id, t.crew_id, l.title, l.place_name, l.leave_at, l.tz,
            l.local_date::text AS local_date
       FROM leave_bys l JOIN trips t ON t.id = l.trip_id WHERE l.id = $1`,
    [str(routed, 'leave_by_id')],
  );
  return rows[0];
}

const clock = (at: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(at);

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
      return {
        title: TRIP_DAY_PUSH.knockTitle,
        body: TRIP_DAY_PUSH.knockBody,
        vars: {
          place: facts.place_name ?? facts.title,
          time: clock(facts.leave_at, facts.tz),
          name: await firstName(tx, sleeper),
        },
        sender: { kind: 'member', id: sleeper, name: await firstName(tx, sleeper) },
        crewId: facts.crew_id,
        tripId: facts.trip_id,
        deepLink: `/hub/${facts.trip_id}/day/${facts.local_date}`,
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
      return {
        title: TRIP_DAY_PUSH.alarmTitle,
        body: TRIP_DAY_PUSH.alarmBody,
        vars: { place: facts.place_name ?? facts.title, time: clock(facts.leave_at, facts.tz) },
        sender: DEFAULT_SETUP_GUIDE,
        crewId: facts.crew_id,
        tripId: facts.trip_id,
        deepLink: `/hub/${facts.trip_id}/day/${facts.local_date}`,
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
        deepLink: `/crew/${trip.crew_id}/chat`,
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
      const { rows } = await tx.query<{ text: string; crew_id: string; place: string | null }>(
        `SELECT i.text, t.crew_id, d.name AS place
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
        deepLink: `/hub/${str(routed, 'trip_id') ?? ''}`,
        collapseVars: { trip_id: str(routed, 'trip_id') ?? '' },
      };
    },
  });
}
