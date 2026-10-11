/**
 * "Tell me when it's done" (the someone's-boosting alert): members who asked to hear how a trip's
 * boost lock ends. A purchase already tells every seated member (`boost_activated`), so this push
 * is only for a lock that lapsed or was let go: the trip's guide says it is free to boost, and the
 * tap opens the boost sheet. Members who joined the lock's buyer since asking are skipped.
 */
import { BILLING_PUSH, registerNotificationTrigger, tripBoostLink } from '@cp/domain';
import type pg from 'pg';

import {
  registerNotification,
  type NotificationSender,
  type RoutedEvent,
} from '../notify/register';
import { str } from '../setup/facts';

const DEFAULT_GUIDE: NotificationSender = { kind: 'guide', id: 'tokek', name: 'Tokek' };

/** The waiting members of a lock that ended without a purchase, still seated on the trip. */
export async function lockFreedAudience(
  tx: pg.PoolClient,
  event: Pick<RoutedEvent, 'payload'>,
): Promise<readonly string[]> {
  const intentId = str(event, 'intent_id');
  if (intentId === null || str(event, 'reason') === 'fulfilled') return [];
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT p.user_id FROM boost_intents i
       JOIN trip_participants p ON p.trip_id = i.trip_id AND p.rsvp <> 'out'
      WHERE i.id = $1 AND p.user_id = ANY (i.waiting_uids) AND p.user_id <> i.buyer_id
      ORDER BY p.user_id`,
    [intentId],
  );
  return rows.map((row) => row.user_id);
}

export async function composeLockFreed(tx: pg.PoolClient, event: RoutedEvent) {
  const intentId = str(event, 'intent_id');
  if (intentId === null) return null;
  const { rows } = await tx.query<{
    trip_id: string;
    buyer: string | null;
    place: string | null;
    crew: string;
    slug: string | null;
    guide: string | null;
    boosted: boolean;
  }>(
    `SELECT i.trip_id, u.display_name AS buyer, d.name AS place, c.name AS crew,
            g.slug, g.name AS guide,
            EXISTS (SELECT 1 FROM trip_boosts b WHERE b.trip_id = i.trip_id
                     AND b.status IN ('scheduled', 'active')) AS boosted
       FROM boost_intents i
       JOIN trips t ON t.id = i.trip_id
       JOIN crews c ON c.id = i.crew_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
       LEFT JOIN users u ON u.id = i.buyer_id
      WHERE i.id = $1`,
    [intentId],
  );
  const row = rows[0];
  // Boosted another way since (a second lock, a gift): nothing to tell.
  if (row === undefined || row.boosted) return null;
  const sender: NotificationSender =
    row.slug !== null && row.guide !== null
      ? { kind: 'guide', id: row.slug, name: row.guide }
      : DEFAULT_GUIDE;
  return {
    title: BILLING_PUSH.lockFreedTitle,
    body: BILLING_PUSH.lockFreedBody,
    vars: {
      place: row.place ?? row.crew,
      buyer: row.buyer?.trim().split(/\s+/u)[0] ?? '',
    },
    sender,
    crewId: event.crewId ?? str(event, 'crew_id'),
    tripId: row.trip_id,
    deepLink: tripBoostLink(row.trip_id),
  };
}

export function registerLockFreedPush(): void {
  registerNotificationTrigger('boost.intent_released', 'boost_lock_freed');
  registerNotification({
    key: 'boost_lock_freed',
    event: 'boost.intent_released',
    audience: lockFreedAudience,
    compose: (tx, event) => composeLockFreed(tx, event),
  });
}
