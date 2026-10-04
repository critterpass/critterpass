/**
 * What the crew hears about the trip itself, from the people on it: a member's own answer (in,
 * maybe, out, waitlisted) to the trip's organisers, and "it's on" to everyone on the trip when it
 * is confirmed (the organiser locked it in, or enough were in when reply-by passed).
 */
import { tripHubPath } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationSender } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, firstName, str } from '../setup/facts';

export const TRIP_NEWS_PUSH = {
  rsvpInTitle: /*i18n*/ { id: 'notifications.rsvp_changed.in_title', message: '{name} is in' },
  rsvpMaybeTitle: /*i18n*/ {
    id: 'notifications.rsvp_changed.maybe_title',
    message: '{name} is a maybe',
  },
  rsvpOutTitle: /*i18n*/ { id: 'notifications.rsvp_changed.out_title', message: '{name} is out' },
  rsvpWaitlistedTitle: /*i18n*/ {
    id: 'notifications.rsvp_changed.waitlisted_title',
    message: '{name} is on the waitlist',
  },
  rsvpBody: /*i18n*/ {
    id: 'notifications.rsvp_changed.body',
    message: 'See who is coming to {place}.',
  },
  confirmedTitle: /*i18n*/ {
    id: 'notifications.trip_confirmed.title',
    message: "It's on: {place}, {dates}",
  },
  confirmedTitleNoDates: /*i18n*/ {
    id: 'notifications.trip_confirmed.title_no_dates',
    message: "It's on: {place}",
  },
  confirmedByBody: /*i18n*/ {
    id: 'notifications.trip_confirmed.locked_by_body',
    message: '{name} locked the trip in.',
  },
  confirmedAutoBody: /*i18n*/ {
    id: 'notifications.trip_confirmed.auto_body',
    message: 'Enough friends are in, so the trip is locked in.',
  },
} as const;

/** The answers an organiser hears about; opening a proposal is not an answer. */
const RSVP_TITLE = {
  in: TRIP_NEWS_PUSH.rsvpInTitle,
  maybe: TRIP_NEWS_PUSH.rsvpMaybeTitle,
  out: TRIP_NEWS_PUSH.rsvpOutTitle,
  waitlisted: TRIP_NEWS_PUSH.rsvpWaitlistedTitle,
} as const;

const isAnswer = (rsvp: unknown): rsvp is keyof typeof RSVP_TITLE =>
  typeof rsvp === 'string' && rsvp in RSVP_TITLE;

interface TripFacts {
  readonly crew_id: string;
  /** The destination, or the crew's name while the trip has none. */
  readonly place: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly guide: NotificationSender;
}

async function tripFacts(tx: pg.PoolClient, tripId: string | null): Promise<TripFacts | null> {
  const { rows } = await tx.query<{
    crew_id: string;
    place: string;
    start_date: string | null;
    end_date: string | null;
    slug: string | null;
    name: string | null;
  }>(
    `SELECT t.crew_id, coalesce(d.name, c.name) AS place, t.start_date::text, t.end_date::text,
            g.slug, g.name
       FROM trips t JOIN crews c ON c.id = t.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    crew_id: row.crew_id,
    place: row.place,
    start_date: row.start_date,
    end_date: row.end_date,
    guide:
      row.slug !== null && row.name !== null
        ? { kind: 'guide', id: row.slug, name: row.name }
        : DEFAULT_SETUP_GUIDE,
  };
}

/** "Oct 2 – 4" in the reader's language; `undefined` while the trip has no dates. */
export function tripDates(
  locale: string,
  start: string | null,
  end: string | null,
): string | undefined {
  if (start === null) return undefined;
  const format = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const from = new Date(`${start}T00:00:00Z`);
  return end === null || end === start
    ? format.format(from)
    : format.formatRange(from, new Date(`${end}T00:00:00Z`));
}

async function readerLocale(tx: pg.PoolClient, uid: string): Promise<string> {
  const { rows } = await tx.query<{ locale: string }>('SELECT app.user_locale($1) AS locale', [
    uid,
  ]);
  return rows[0]?.locale ?? 'en';
}

let registered = false;

export function registerTripNewsNotifications(): void {
  if (registered) return;
  registered = true;

  registerNotification({
    key: 'rsvp_changed',
    event: 'rsvp.changed',
    // Only an answer the member gave themselves: seats an organiser or the reply-by lock moved
    // are already known to the organiser, or announced by the lock.
    async audience(tx, routed) {
      const member = str(routed, 'user_id');
      if (member === null || routed.actorId !== member) return [];
      if (!isAnswer(routed.payload['rsvp'])) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND role = 'organiser' AND rsvp <> 'out' AND user_id <> $2
          ORDER BY user_id`,
        [str(routed, 'trip_id'), member],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed) {
      const member = str(routed, 'user_id');
      const tripId = str(routed, 'trip_id');
      const rsvp = routed.payload['rsvp'];
      if (member === null || !isAnswer(rsvp)) return null;
      const trip = await tripFacts(tx, tripId);
      if (trip === null) return null;
      const { rows } = await tx.query<{ rsvp: string }>(
        'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
        [tripId, member],
      );
      // Changed again since: the newer event carries the answer that stands.
      if (rows[0]?.rsvp !== rsvp) return null;
      const name = await firstName(tx, member);
      return {
        title: RSVP_TITLE[rsvp],
        body: TRIP_NEWS_PUSH.rsvpBody,
        vars: { name, place: trip.place },
        sender: { kind: 'member', id: member, name },
        crewId: trip.crew_id,
        tripId,
        deepLink: tripHubPath(tripId ?? ''),
        collapseVars: { trip_id: tripId ?? '' },
      };
    },
  });

  registerNotification({
    key: 'trip_confirmed',
    event: 'trip.status_changed',
    // Everyone holding a place on the trip, except whoever locked it in.
    async audience(tx, routed) {
      if (routed.payload['to'] !== 'confirmed') return [];
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')
            AND user_id IS DISTINCT FROM $2::uuid
          ORDER BY user_id`,
        [str(routed, 'trip_id'), routed.actorId],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, routed, uid) {
      const tripId = str(routed, 'trip_id');
      const trip = await tripFacts(tx, tripId);
      if (trip === null) return null;
      const dates = tripDates(await readerLocale(tx, uid), trip.start_date, trip.end_date);
      const locker = routed.actorId === null ? '' : await firstName(tx, routed.actorId);
      return {
        title:
          dates === undefined
            ? TRIP_NEWS_PUSH.confirmedTitleNoDates
            : TRIP_NEWS_PUSH.confirmedTitle,
        body: locker === '' ? TRIP_NEWS_PUSH.confirmedAutoBody : TRIP_NEWS_PUSH.confirmedByBody,
        vars: { place: trip.place, dates: dates ?? '', name: locker },
        sender: trip.guide,
        crewId: trip.crew_id,
        tripId,
        deepLink: tripHubPath(tripId ?? ''),
        collapseVars: { trip_id: tripId ?? '' },
      };
    },
  });
}
