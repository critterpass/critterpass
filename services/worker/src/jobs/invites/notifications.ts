/**
 * Crew growth pushes: a freed seat offered to someone waiting (from the trip's guide), an in-app
 * crew invite to someone already on CritterPass (from the inviter), and the single nudge an
 * installed invitee gets after a day (from the guide). Copy is templated here, marked for extraction
 * into the `notifications/common` catalog, and rendered in each recipient's locale by the router; the guide-voice rewrite may restyle guide-sent copy. Deep
 * links are in-app routes; the app resolves them against its own scheme.
 */
import type pg from 'pg';

import {
  registerNotification,
  type NotificationSender,
  type RoutedEvent,
} from '../notify/register';

const DEFAULT_GUIDE: NotificationSender = { kind: 'guide', id: 'tokek', name: 'Tokek' };

function payloadId(event: RoutedEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
}

async function tripGuide(tx: pg.PoolClient, tripId: string | null): Promise<NotificationSender> {
  if (tripId === null) return DEFAULT_GUIDE;
  const { rows } = await tx.query<{ slug: string; name: string }>(
    `SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = $1`,
    [tripId],
  );
  const guide = rows[0];
  return guide === undefined ? DEFAULT_GUIDE : { kind: 'guide', id: guide.slug, name: guide.name };
}

async function crewName(tx: pg.PoolClient, crewId: string | null): Promise<string> {
  if (crewId === null) return '';
  const { rows } = await tx.query<{ name: string }>('SELECT name FROM crews WHERE id = $1', [
    crewId,
  ]);
  return rows[0]?.name ?? '';
}

const onlyUser = (key: string) => (_tx: pg.PoolClient, event: RoutedEvent) => {
  const uid = payloadId(event, key);
  return Promise.resolve(uid === null ? [] : [uid]);
};

let registered = false;

export function registerInviteNotifications(): void {
  if (registered) return;
  registered = true;

  registerNotification({
    key: 'seat_opened',
    event: 'trip.seat_opened',
    audience: onlyUser('user_id'),
    async compose(tx, event) {
      const tripId = payloadId(event, 'trip_id');
      const expiresAt = payloadId(event, 'expires_at');
      return {
        title: /*i18n*/ {
          id: 'notifications.seat_opened.title',
          message: 'A seat just opened',
        },
        body: /*i18n*/ {
          id: 'notifications.seat_opened.body',
          message: "You're next on {crew}'s trip. The seat is yours if you take it within a day.",
        },
        vars: { crew: await crewName(tx, event.crewId) },
        sender: await tripGuide(tx, tripId),
        tripId,
        crewId: event.crewId,
        deepLink: `/crew?seat_offer=${payloadId(event, 'offer_id') ?? ''}`,
        needsYou: true,
        ...(expiresAt === null ? {} : { expiresAt: new Date(expiresAt) }),
      };
    },
  });

  registerNotification({
    key: 'crew_invite_received',
    event: 'invite.created',
    audience: onlyUser('invitee_user_id'),
    async compose(tx, event) {
      const inviterId = event.actorId;
      const { rows } = await tx.query<{ display_name: string | null }>(
        'SELECT display_name FROM users WHERE id = $1',
        [inviterId],
      );
      const inviter = rows[0]?.display_name?.trim().split(/\s+/)[0] ?? '';
      return {
        title: /*i18n*/ {
          id: 'notifications.crew_invite.title',
          message: '{inviter} wants you in {crew}',
        },
        body: /*i18n*/ {
          id: 'notifications.crew_invite.body',
          message: 'Join now, or save it for later.',
        },
        vars: { inviter, crew: await crewName(tx, event.crewId) },
        sender: { kind: 'member', id: inviterId ?? 'critterpass', name: inviter },
        crewId: event.crewId,
        deepLink: '/crew',
        needsYou: true,
      };
    },
  });

  registerNotification({
    key: 'nudge',
    event: 'invite.nudged',
    audience: onlyUser('invitee_user_id'),
    async compose(tx, event) {
      return {
        title: /*i18n*/ {
          id: 'notifications.invite_nudge.title',
          message: '{crew} is still saving you a spot',
        },
        body: /*i18n*/ {
          id: 'notifications.invite_nudge.body',
          message: 'Tap to join them. It takes a few seconds.',
        },
        vars: { crew: await crewName(tx, event.crewId) },
        sender: await tripGuide(tx, payloadId(event, 'trip_id')),
        crewId: event.crewId,
        deepLink: '/crew',
      };
    },
  });
}
