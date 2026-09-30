/**
 * Crew live map pushes. `crew_ping` (ALWAYS, from the member): PING ALL and I'M ON MY WAY, to every
 * participant still on the trip but the sender. `meetup_changed` (budgeted, collapsed per
 * meet-up): a set or moved meet-up to the members sharing on the map but the one who changed it,
 * and once "everyone's nearly there" to every sharing member. All open the crew map.
 */
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';

const str = (event: RoutedEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

async function participantsBut(tx: pg.PoolClient, tripId: string, except: string | null) {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT tp.user_id FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       JOIN crew_members cm ON cm.crew_id = t.crew_id AND cm.user_id = tp.user_id
      WHERE tp.trip_id = $1 AND cm.status = 'active' AND (tp.rsvp <> 'out' OR tp.role = 'organiser')
        AND ($2::uuid IS NULL OR tp.user_id <> $2::uuid)
      ORDER BY tp.user_id`,
    [tripId, except],
  );
  return rows.map((row) => row.user_id);
}

async function sharingBut(tx: pg.PoolClient, tripId: string, except: string | null) {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT DISTINCT s.user_id FROM location_shares s
      WHERE s.trip_id = $1 AND s.reason = 'crew_map'
        AND s.starts_at <= now() AND (s.ends_at IS NULL OR s.ends_at > now())
        AND ($2::uuid IS NULL OR s.user_id <> $2::uuid)
      ORDER BY s.user_id`,
    [tripId, except],
  );
  return rows.map((row) => row.user_id);
}

interface MeetupFacts {
  readonly place: string;
  readonly time: string;
  readonly crew: string;
  readonly sender: string;
  readonly avatar: string | null;
}

/** Place, local meet time (HH:mm, trip zone), crew name and the actor's first name. */
async function meetupFacts(
  tx: pg.PoolClient,
  tripId: string,
  meetupId: string | null,
  actorId: string | null,
): Promise<MeetupFacts | null> {
  const { rows } = await tx.query<{
    place: string | null;
    meet_at: Date | null;
    tz: string | null;
    crew: string;
    sender: string | null;
    avatar: string | null;
  }>(
    `SELECT m.place_name AS place, m.meet_at, t.tz, c.name AS crew, u.display_name AS sender,
            a.variant_keys->>'120' AS avatar
       FROM trips t
       JOIN crews c ON c.id = t.crew_id
       LEFT JOIN meetups m ON m.id = $2
       LEFT JOIN users u ON u.id = $3
       LEFT JOIN avatars a ON a.id = u.avatar_id AND a.moderation_status = 'approved'
      WHERE t.id = $1`,
    [tripId, meetupId, actorId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const time =
    row.meet_at === null
      ? ''
      : new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: row.tz ?? 'UTC',
        }).format(row.meet_at);
  return {
    place: row.place ?? '',
    time,
    crew: row.crew,
    sender: row.sender?.trim().split(/\s+/)[0] ?? '',
    avatar: row.avatar,
  };
}

let registered = false;

export function registerLiveMapNotifications(): void {
  if (registered) return;
  registered = true;

  registerNotification({
    key: 'crew_ping',
    event: 'crew.pinged',
    audience: (tx, event) =>
      event.tripId === null
        ? Promise.resolve([])
        : participantsBut(tx, event.tripId, event.actorId),
    async compose(tx, event) {
      if (event.tripId === null) return null;
      const facts = await meetupFacts(tx, event.tripId, str(event, 'meetup_id'), event.actorId);
      if (facts === null) return null;
      const onMyWay = event.payload['kind'] === 'on_my_way';
      const eta = event.payload['eta_min'];
      const body = onMyWay
        ? typeof eta === 'number'
          ? /*i18n*/ {
              id: 'notifications.crew_ping.on_my_way_eta',
              message: 'On my way. {minutes} min out.',
            }
          : /*i18n*/ { id: 'notifications.crew_ping.on_my_way', message: 'On my way.' }
        : facts.place === ''
          ? /*i18n*/ {
              id: 'notifications.crew_ping.ping',
              message: 'Where is everyone? Check the map.',
            }
          : /*i18n*/ {
              id: 'notifications.crew_ping.ping_meetup',
              message: 'Meet at {place}, {time}.',
            };
      return {
        title: /*i18n*/ { id: 'notifications.crew_ping.title', message: '{sender} · {crew}' },
        body,
        vars: {
          sender: facts.sender,
          crew: facts.crew,
          place: facts.place,
          time: facts.time,
          minutes: typeof eta === 'number' ? eta : 0,
        },
        sender: {
          kind: 'member',
          id: event.actorId ?? 'critterpass',
          name: facts.sender,
          ...(facts.avatar === null ? {} : { avatar: facts.avatar }),
        },
        tripId: event.tripId,
        deepLink: `/map/${event.tripId}`,
        ctx: { trip_id: event.tripId, kind: onMyWay ? 'on_my_way' : 'ping' },
      };
    },
  });

  const meetupChange = (event: 'meetup.created' | 'meetup.moved' | 'meetup.crew_close') =>
    registerNotification({
      key: 'meetup_changed',
      event,
      audience: (tx, routed) =>
        routed.tripId === null
          ? Promise.resolve([])
          : sharingBut(tx, routed.tripId, event === 'meetup.crew_close' ? null : routed.actorId),
      async compose(tx, routed) {
        const meetupId = str(routed, 'meetup_id');
        if (routed.tripId === null || meetupId === null) return null;
        const facts = await meetupFacts(tx, routed.tripId, meetupId, routed.actorId);
        if (facts === null || facts.place === '') return null;
        const body =
          event === 'meetup.crew_close'
            ? /*i18n*/ {
                id: 'notifications.meetup_changed.crew_close',
                message: "Everyone's nearly at {place}.",
              }
            : event === 'meetup.created'
              ? /*i18n*/ {
                  id: 'notifications.meetup_changed.created',
                  message: '{sender} set a meet-up: {place}, {time}.',
                }
              : /*i18n*/ {
                  id: 'notifications.meetup_changed.moved',
                  message: '{sender} moved the meet-up: {place}, {time}.',
                };
        return {
          title: /*i18n*/ { id: 'notifications.meetup_changed.title', message: '{crew}' },
          body,
          vars: { sender: facts.sender, crew: facts.crew, place: facts.place, time: facts.time },
          sender:
            event === 'meetup.crew_close' || routed.actorId === null
              ? { kind: 'system', id: 'critterpass', name: 'CritterPass' }
              : {
                  kind: 'member',
                  id: routed.actorId,
                  name: facts.sender,
                  ...(facts.avatar === null ? {} : { avatar: facts.avatar }),
                },
          tripId: routed.tripId,
          deepLink: `/map/${routed.tripId}`,
          ctx: { trip_id: routed.tripId, meetup_id: meetupId },
          collapseVars: { meetup_id: meetupId },
        };
      },
    });
  meetupChange('meetup.created');
  meetupChange('meetup.moved');
  meetupChange('meetup.crew_close');
}
