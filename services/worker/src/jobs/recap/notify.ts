/**
 * Recap pushes: N-32 to every viewer when the trip's recap is first ready (once per recap: a
 * re-run never appends `recap.ready` again, and the dedupe key is the recap's), from the trip's
 * guide, opening the recap; N-35 a year later to each traveller on their own morning, quietly,
 * opening the memory. Registered from the worker entry, like the other feature pushes.
 */
import { RECAP_PUSH } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationSender } from '../notify/register';
import { DEFAULT_SETUP_GUIDE, str } from '../setup/facts';

async function tripVoice(
  tx: pg.PoolClient,
  tripId: string | null,
): Promise<{ sender: NotificationSender; place: string }> {
  const { rows } = await tx.query<{
    slug: string | null;
    guide: string | null;
    place: string | null;
  }>(
    `SELECT g.slug, g.name AS guide, d.name AS place
       FROM trips t
       LEFT JOIN guides g ON g.id = t.guide_id
       LEFT JOIN destinations d ON d.id = t.destination_id
      WHERE t.id = $1`,
    [tripId],
  );
  const row = rows[0];
  return {
    sender:
      row?.slug == null || row.guide === null
        ? DEFAULT_SETUP_GUIDE
        : { kind: 'guide', id: row.slug, name: row.guide },
    place: row?.place ?? 'your trip',
  };
}

let registered = false;

export function registerRecapPushes(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'recap_ready',
    event: 'recap.ready',
    async audience(tx, event) {
      const { rows } = await tx.query<{ user_id: string }>(
        'SELECT user_id FROM recap_views WHERE recap_id = $1 ORDER BY user_id',
        [str(event, 'recap_id')],
      );
      return rows.map((row) => row.user_id);
    },
    async compose(tx, event) {
      const { sender, place } = await tripVoice(tx, event.tripId);
      return {
        title: RECAP_PUSH.readyTitle,
        body: RECAP_PUSH.readyBody,
        vars: { place },
        sender,
        tripId: event.tripId,
        deepLink: `/recap/${event.tripId ?? ''}`,
        ctx: { recap_id: str(event, 'recap_id') },
      };
    },
    dedupeKey: (event, uid) => `recap_ready:${str(event, 'recap_id') ?? event.id}:${uid}`,
  });
  registerNotification({
    key: 'anniversary_memory',
    event: 'memory.surfaced',
    audience: (_tx, event) => Promise.resolve([str(event, 'user_id')].filter((u) => u !== null)),
    async compose(tx, event) {
      const { sender, place } = await tripVoice(tx, event.tripId);
      const memoryId = str(event, 'memory_id');
      return {
        title: RECAP_PUSH.anniversaryTitle,
        body: RECAP_PUSH.anniversaryBody,
        vars: { place },
        sender,
        tripId: event.tripId,
        deepLink: `/memory/${memoryId ?? ''}?trip=${event.tripId ?? ''}`,
        ctx: { memory_id: memoryId },
      };
    },
    dedupeKey: (event, uid) => `anniversary_memory:${str(event, 'memory_id') ?? event.id}:${uid}`,
  });
}
