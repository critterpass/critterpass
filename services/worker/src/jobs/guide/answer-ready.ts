/**
 * The "ping me" push: someone left the guide while it was writing an answer and asked to hear when
 * it lands. `guide.answer_ready` goes to that person only and opens their thread.
 */
import { ANSWER_READY_BODY, ANSWER_READY_TITLE, guideThreadLink } from '@cp/domain';

import { registerNotification } from '../notify/register';

let registered = false;

export function registerAnswerReadyPush(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'answer_ready',
    event: 'guide.answer_ready',
    audience: (_tx, event) => {
      const uid = event.payload['user_id'];
      return Promise.resolve(typeof uid === 'string' ? [uid] : []);
    },
    async compose(tx, event, uid) {
      const threadId = event.payload['thread_id'];
      if (typeof threadId !== 'string' || event.payload['user_id'] !== uid) return null;
      const { rows } = await tx.query<{ id: string; name: string }>(
        `SELECT g.id, g.name FROM guide_threads th
           LEFT JOIN trips t ON t.id = th.trip_id
           JOIN guides g ON g.id = coalesce(th.guide_id, t.guide_id)
          WHERE th.id = $1`,
        [threadId],
      );
      const guide = rows[0] ?? { id: 'guide', name: 'Your guide' };
      return {
        title: ANSWER_READY_TITLE,
        body: ANSWER_READY_BODY,
        vars: { guide: guide.name },
        sender: { kind: 'guide', id: guide.id, name: guide.name },
        tripId: event.tripId,
        deepLink: guideThreadLink(threadId),
        ctx: { message_id: event.payload['message_id'] },
      };
    },
  });
}
