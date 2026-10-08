/**
 * Help and SOS pushes. `sos` (N-24, ALWAYS, from the sender with their avatar): a crewmate needs
 * help, to every participant still on the trip but the sender, again when nobody answered; it
 * collapses per incident and opens the takeover. `sos_resolved` (N-48, ALWAYS): the all-clear, or
 * the false alarm, to the same crew. `help_share_changed` (N-25, budgeted): someone is sharing
 * where they are from Help, to the crew; it opens the session map. Copy tells the crew what
 * happened and never says anyone contacted emergency services. A push never carries what the
 * sender wrote (their words may describe their health): the body is the preset's line or the plain
 * one, and the words are read in the app, from the session.
 */
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';

const str = (event: RoutedEvent, key: string): string | null => {
  const value = event.payload[key];
  return typeof value === 'string' ? value : null;
};

/** Participants still on the trip (not answered `out` unless organising) but `except`. */
export async function crewBut(
  tx: pg.PoolClient,
  tripId: string,
  except: string | null,
): Promise<string[]> {
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

interface SenderFacts {
  readonly name: string;
  readonly crew: string;
  readonly avatar: string | null;
  readonly senderId: string;
}

async function senderFacts(
  tx: pg.PoolClient,
  sessionId: string,
): Promise<(SenderFacts & { readonly tripId: string }) | null> {
  const { rows } = await tx.query<{
    trip_id: string;
    user_id: string;
    name: string | null;
    crew: string;
    avatar: string | null;
  }>(
    `SELECT s.trip_id, s.user_id, u.display_name AS name, c.name AS crew,
            a.variant_keys->>'120' AS avatar
       FROM help_sessions s
       JOIN trips t ON t.id = s.trip_id
       JOIN crews c ON c.id = t.crew_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN avatars a ON a.id = u.avatar_id AND a.moderation_status = 'approved'
      WHERE s.id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return {
    tripId: row.trip_id,
    senderId: row.user_id,
    name: row.name?.trim().split(/\s+/)[0] ?? '',
    crew: row.crew,
    avatar: row.avatar,
  };
}

const memberSender = (facts: SenderFacts) => ({
  kind: 'member' as const,
  id: facts.senderId,
  name: facts.name,
  ...(facts.avatar === null ? {} : { avatar: facts.avatar }),
});

const num = (event: RoutedEvent, key: string): boolean => event.payload[key] === true;

interface SosFacts extends SenderFacts {
  readonly tripId: string;
  readonly preset: string | null;
}

async function sosFacts(tx: pg.PoolClient, sosId: string): Promise<SosFacts | null> {
  const facts = await senderFacts(tx, sosId);
  if (facts === null) return null;
  const { rows } = await tx.query<{ preset: string | null }>(
    'SELECT preset FROM help_sessions WHERE id = $1',
    [sosId],
  );
  return { ...facts, preset: rows[0]?.preset ?? null };
}

function sosBody(facts: SosFacts, escalated: boolean) {
  if (escalated) {
    return /*i18n*/ {
      id: 'notifications.sos.escalated',
      message: "Nobody's answered yet. {sender} still needs help.",
    };
  }
  switch (facts.preset) {
    case 'fell':
      return /*i18n*/ { id: 'notifications.sos.fell', message: '{sender} fell and needs a hand.' };
    case 'lost':
      return /*i18n*/ {
        id: 'notifications.sos.lost',
        message: '{sender} is lost and needs a hand.',
      };
    case 'need_ride':
      return /*i18n*/ { id: 'notifications.sos.need_ride', message: '{sender} needs a ride.' };
    case null:
    default:
      return /*i18n*/ {
        id: 'notifications.sos.plain',
        message: '{sender} sent an SOS to the crew.',
      };
  }
}

let registered = false;

export function registerSafetyNotifications(): void {
  if (registered) return;
  registered = true;

  registerNotification({
    key: 'help_share_changed',
    event: 'help_share.started',
    audience: (tx, event) =>
      event.tripId === null ? Promise.resolve([]) : crewBut(tx, event.tripId, event.actorId),
    async compose(tx, event) {
      const sessionId = str(event, 'session_id');
      if (sessionId === null) return null;
      const facts = await senderFacts(tx, sessionId);
      if (facts === null) return null;
      return {
        title: /*i18n*/ { id: 'notifications.help_share.title', message: '{sender} · {crew}' },
        body: /*i18n*/ {
          id: 'notifications.help_share.started',
          message: '{sender} opened Help and is sharing where they are for an hour.',
        },
        vars: { sender: facts.name, crew: facts.crew },
        sender: memberSender(facts),
        tripId: facts.tripId,
        // The crew map draws the sharer: a Help share's fixes go out on the trip's location channel.
        deepLink: `/map/${facts.tripId}`,
        ctx: { trip_id: facts.tripId, session_id: sessionId, share_id: str(event, 'share_id') },
      };
    },
  });

  // The sharer alone, ten minutes before their Help share ends. Worded as a location share: the
  // lock screen never says Help. STOP and +1 H act on it (category `cp.help`).
  registerNotification({
    key: 'location_share_ending',
    event: 'help_share.ending',
    async audience(tx, event) {
      const shareId = str(event, 'share_id');
      if (shareId === null) return [];
      const { rows } = await tx.query<{ user_id: string }>(
        'SELECT user_id FROM location_shares WHERE id = $1',
        [shareId],
      );
      return rows.map((row) => row.user_id);
    },
    compose(_tx, event, uid) {
      const shareId = str(event, 'share_id');
      if (shareId === null || event.tripId === null) return Promise.resolve(null);
      return Promise.resolve({
        title: /*i18n*/ { id: 'notifications.location_share.title', message: 'Location share' },
        body: /*i18n*/ {
          id: 'notifications.location_share.ending',
          message: 'Your location share with the crew ends in 10 minutes.',
        },
        sender: { kind: 'system' as const, id: 'critterpass', name: 'CritterPass' },
        tripId: event.tripId,
        ctx: { trip_id: event.tripId, share_id: shareId, sharer_id: uid },
        collapseVars: { share_id: shareId },
      });
    },
  });

  const sos = (event: 'sos.triggered' | 'sos.escalated') =>
    registerNotification({
      key: 'sos',
      event,
      async audience(tx, routed) {
        const sosId = str(routed, 'sos_id');
        if (routed.tripId === null || sosId === null) return [];
        const sender = await tx.query<{ user_id: string }>(
          'SELECT user_id FROM help_sessions WHERE id = $1',
          [sosId],
        );
        return crewBut(tx, routed.tripId, sender.rows[0]?.user_id ?? routed.actorId);
      },
      async compose(tx, routed) {
        const sosId = str(routed, 'sos_id');
        if (sosId === null) return null;
        const facts = await sosFacts(tx, sosId);
        if (facts === null) return null;
        const open = await tx.query(
          "SELECT 1 FROM help_sessions WHERE id = $1 AND status IN ('open', 'responding')",
          [sosId],
        );
        if ((open.rowCount ?? 0) === 0) return null;
        return {
          title: /*i18n*/ { id: 'notifications.sos.title', message: '{sender} needs help' },
          body: sosBody(facts, event === 'sos.escalated'),
          vars: { sender: facts.name, crew: facts.crew },
          sender: memberSender(facts),
          tripId: facts.tripId,
          deepLink: `/sos/${sosId}`,
          threadId: `sos:${sosId}`,
          ctx: { trip_id: facts.tripId, sos_id: sosId, sender_id: facts.senderId },
          needsYou: true,
          collapseVars: { sos_id: sosId },
        };
      },
    });
  sos('sos.triggered');
  sos('sos.escalated');

  registerNotification({
    key: 'sos_resolved',
    event: 'sos.resolved',
    audience: (tx, event) =>
      event.tripId === null || !num(event, 'alerted')
        ? Promise.resolve([])
        : crewBut(tx, event.tripId, event.actorId).then(async (uids) => {
            const sosId = str(event, 'sos_id');
            if (sosId === null) return uids;
            const sender = await tx.query<{ user_id: string }>(
              'SELECT user_id FROM help_sessions WHERE id = $1',
              [sosId],
            );
            const senderId = sender.rows[0]?.user_id;
            return senderId === undefined || senderId === event.actorId || uids.includes(senderId)
              ? uids
              : [...uids, senderId];
          }),
    async compose(tx, event) {
      const sosId = str(event, 'sos_id');
      if (sosId === null) return null;
      const facts = await sosFacts(tx, sosId);
      if (facts === null) return null;
      return {
        title: /*i18n*/ { id: 'notifications.sos_resolved.title', message: '{crew}' },
        body: num(event, 'false_alarm')
          ? /*i18n*/ {
              id: 'notifications.sos_resolved.false_alarm',
              message: 'False alarm: {sender} is OK.',
            }
          : /*i18n*/ {
              id: 'notifications.sos_resolved.safe',
              message: '{sender} is safe. Thanks for being there.',
            },
        vars: { sender: facts.name, crew: facts.crew },
        sender: memberSender(facts),
        tripId: facts.tripId,
        deepLink: `/sos/${sosId}`,
        threadId: `sos:${sosId}`,
        ctx: { trip_id: facts.tripId, sos_id: sosId },
        collapseVars: { sos_id: sosId },
      };
    },
  });
}
