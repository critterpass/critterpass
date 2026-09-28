/**
 * The N-12 nudge push: from the guide of the crew's trip (Tokek when there is none), saying which
 * crewmate asked, in the target's language. BUDGET class: over budget or in quiet hours it waits
 * for the roundup, and a target without a push token gets only the inbox item.
 */
import { NUDGE_PUSH_BODY, NUDGE_PUSH_TITLE, nudgeReasonSchema } from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type NotificationSender } from '../notify/register';

const DEFAULT_GUIDE: NotificationSender = { kind: 'guide', id: 'tokek', name: 'Tokek' };

async function nudgeFacts(tx: pg.PoolClient, nudgeId: unknown) {
  const { rows } = await tx.query<{
    crew: string;
    sender: string;
    guide_slug: string | null;
    guide_name: string | null;
  }>(
    `SELECT c.name AS crew,
            coalesce(split_part(trim(u.display_name), ' ', 1), '') AS sender,
            g.slug AS guide_slug, g.name AS guide_name
       FROM nudges n
       JOIN crews c ON c.id = n.crew_id
       JOIN users u ON u.id = n.sender_id
       LEFT JOIN trips t ON t.id = n.trip_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE n.id = $1`,
    [nudgeId],
  );
  return rows[0];
}

let registered = false;

export function registerNudgeNotifications(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'nudge',
    event: 'nudge.received',
    audience: (_tx, event) => {
      const uid = event.payload['target_id'];
      return Promise.resolve(typeof uid === 'string' ? [uid] : []);
    },
    async compose(tx, event) {
      const facts = await nudgeFacts(tx, event.payload['nudge_id']);
      const reason = nudgeReasonSchema.safeParse(event.payload['reason']);
      if (facts === undefined || !reason.success) return null;
      const sender: NotificationSender =
        facts.guide_slug !== null && facts.guide_name !== null
          ? { kind: 'guide', id: facts.guide_slug, name: facts.guide_name }
          : DEFAULT_GUIDE;
      return {
        title: NUDGE_PUSH_TITLE,
        body: NUDGE_PUSH_BODY[reason.data],
        vars: { guide: sender.name, sender: facts.sender, crew: facts.crew },
        sender,
        crewId: event.crewId,
        tripId: event.tripId,
        deepLink: '/inbox',
        needsYou: true,
      };
    },
  });
}
