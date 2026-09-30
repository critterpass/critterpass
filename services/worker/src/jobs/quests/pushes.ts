/**
 * Quest pushes: the day's quests in the evening roundup (`quests_ready`, once per trip day), and a
 * finished quest's reward to everyone it counted for (`settled_reward`, the catalogue's crew reward
 * key), both in the trip guide's voice. The push lands on the quests screen, which reveals the
 * reward at the shared moment (or shows it already granted to a late opener).
 */
import { QUEST_PUSH } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationSender } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

async function tripGuide(tx: pg.PoolClient, tripId: string | null): Promise<NotificationSender> {
  if (tripId === null) return DEFAULT_SETUP_GUIDE;
  const { rows } = await tx.query<{ slug: string; name: string }>(
    'SELECT g.slug, g.name FROM trips t JOIN guides g ON g.id = t.guide_id WHERE t.id = $1',
    [tripId],
  );
  const guide = rows[0];
  return guide === undefined
    ? DEFAULT_SETUP_GUIDE
    : { kind: 'guide', id: guide.slug, name: guide.name };
}

let registered = false;

export function registerQuestPushes(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'quests_ready',
    event: 'quest.published',
    async audience(tx, event) {
      const { rows } = await tx.query<{ user_id: string }>(
        `SELECT user_id FROM trip_participants
          WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted') ORDER BY user_id`,
        [event.tripId],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, event) {
      const ids = event.payload['quest_ids'];
      const { rows } = await tx.query<{ name: string }>(
        'SELECT d.name FROM trips t JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1',
        [event.tripId],
      );
      return {
        title: QUEST_PUSH.readyTitle,
        body: QUEST_PUSH.readyBody,
        vars: { count: Array.isArray(ids) ? ids.length : 0, place: rows[0]?.name ?? 'today' },
        sender: await tripGuide(tx, event.tripId),
        crewId: event.crewId,
        tripId: event.tripId,
        deepLink: `/quests/${event.tripId ?? ''}`,
      };
    },
    dedupeKey: (event, uid) =>
      `quests_ready:${event.tripId ?? ''}:${str(event, 'local_date') ?? ''}:${uid}`,
  });
  registerNotification({
    key: 'settled_reward',
    event: 'quest.completed',
    audience: (_tx, event) => {
      const ids = event.payload['user_ids'];
      return Promise.resolve(
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [],
      );
    },
    async compose(tx, event) {
      const questId = str(event, 'quest_id');
      const { rows } = await tx.query<{ title: string }>('SELECT title FROM quests WHERE id = $1', [
        questId,
      ]);
      const title = rows[0]?.title;
      if (title === undefined) return null;
      return {
        title: QUEST_PUSH.doneTitle,
        body: QUEST_PUSH.doneBody,
        vars: { title, xp: Number(event.payload['xp'] ?? 0) },
        sender: await tripGuide(tx, event.tripId),
        crewId: event.crewId,
        tripId: event.tripId,
        deepLink: `/quests/${event.tripId ?? ''}`,
        ctx: { reward: 'quest', quest_id: questId, reveal_at: str(event, 'reveal_at') },
      };
    },
  });
}
