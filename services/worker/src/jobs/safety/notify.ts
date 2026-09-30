/**
 * Help and SOS pushes. `sos` (N-24, ALWAYS, from the sender with their avatar): a crewmate needs
 * help, to every participant still on the trip but the sender, again when nobody answered; it
 * collapses per incident and opens the takeover. `sos_resolved` (N-48, ALWAYS): the all-clear, or
 * the false alarm, to the same crew. `help_share_changed` (N-25, budgeted): someone is sharing
 * where they are from Help, to the crew; it opens the session map. Copy tells the crew what
 * happened and never says anyone contacted emergency services.
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
        title: { id: 'notifications.help_share.title', message: '{sender} · {crew}' },
        body: {
          id: 'notifications.help_share.started',
          message: '{sender} opened Help and is sharing where they are for an hour.',
        },
        vars: { sender: facts.name, crew: facts.crew },
        sender: memberSender(facts),
        tripId: facts.tripId,
        deepLink: `/help/${facts.tripId}/session/${sessionId}`,
        ctx: { trip_id: facts.tripId, session_id: sessionId, share_id: str(event, 'share_id') },
      };
    },
  });
}
