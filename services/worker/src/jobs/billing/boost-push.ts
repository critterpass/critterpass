/**
 * The boost push: when a member's purchase boosts a trip, everyone else seated on it hears it from
 * that crewmate ("Winston boosted Kyoto"), with the way into the crew chat where the boost's card
 * is. A boost nobody bought (a first trip free, a moved boost, support's grant) sends nothing, and
 * neither does one that is no longer on by the time the push is composed.
 */
import { BILLING_PUSH, crewChatLink, registerNotificationTrigger } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { str } from '../setup/facts';

interface BoostFacts {
  readonly buyer: string | null;
  readonly avatar: string | null;
  readonly place: string | null;
  readonly crew: string;
  readonly live: boolean;
}

/** Who to tell: the trip's seated members, the buyer aside. Nobody for a boost without a buyer. */
export async function boostPushAudience(
  tx: pg.PoolClient,
  event: Pick<RoutedEvent, 'payload' | 'tripId'>,
): Promise<readonly string[]> {
  const buyer = str(event, 'buyer_id');
  const tripId = str(event, 'trip_id') ?? event.tripId;
  if (buyer === null || tripId === null || str(event, 'source') !== 'purchase') return [];
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT user_id FROM trip_participants
      WHERE trip_id = $1 AND rsvp <> 'out' AND user_id <> $2 ORDER BY created_at, user_id`,
    [tripId, buyer],
  );
  return rows.map((row) => row.user_id);
}

export async function composeBoostPush(tx: pg.PoolClient, event: RoutedEvent) {
  const buyerId = str(event, 'buyer_id');
  const boostId = str(event, 'boost_id');
  if (buyerId === null || boostId === null) return null;
  const { rows } = await tx.query<BoostFacts>(
    `SELECT u.display_name AS buyer, a.variant_keys->>'120' AS avatar, d.name AS place, c.name AS crew,
            b.status IN ('scheduled', 'active') AS live
       FROM trip_boosts b
       JOIN crews c ON c.id = b.crew_id
       JOIN trips t ON t.id = b.trip_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN users u ON u.id = b.buyer_id
       LEFT JOIN avatars a ON a.id = u.avatar_id AND a.moderation_status = 'approved'
      WHERE b.id = $1`,
    [boostId],
  );
  const row = rows[0];
  if (row === undefined || !row.live) return null;
  const buyer = row.buyer?.trim().split(/\s+/u)[0] ?? '';
  if (buyer === '') return null;
  const crewId = event.crewId ?? str(event, 'crew_id');
  return {
    title: BILLING_PUSH.boostTitle,
    body: BILLING_PUSH.boostBody,
    vars: { buyer, place: row.place ?? row.crew },
    sender: {
      kind: 'member' as const,
      id: buyerId,
      name: buyer,
      ...(row.avatar === null ? {} : { avatar: row.avatar }),
    },
    crewId,
    tripId: event.tripId ?? str(event, 'trip_id'),
    ...(crewId === null ? {} : { deepLink: crewChatLink(crewId), threadId: crewId }),
  };
}

export function registerBoostPush(): void {
  registerNotificationTrigger('boost.activated', 'boost_activated');
  registerNotification({
    key: 'boost_activated',
    event: 'boost.activated',
    audience: boostPushAudience,
    compose: (tx, event) => composeBoostPush(tx, event),
  });
}
