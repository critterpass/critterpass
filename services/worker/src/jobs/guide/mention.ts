/**
 * `ai.guide_mention` (docs/api-contracts-async.md §2.2): the guide answers a crew-chat @mention
 * nobody streamed from the app (sent offline, or the app never asked). The reply streams to the crew
 * as `guide.token` and is posted as the guide; one retry. A mention already answered, a spent free
 * meter or a switched-off route ends the job quietly.
 */
import { prepareCrewMention } from '@cp/ai';
import { withSystem } from '@cp/db';
import { DomainError, generateUuidV7, GUIDE_QUEUES, guideMentionJobSchema } from '@cp/domain';

import { defineJob } from '../../boss';
import { crewTurnPorts, type GuideRuntime } from './runtime';

export function guideMentionJob(runtime: GuideRuntime) {
  return defineJob({
    queue: GUIDE_QUEUES.mention,
    schema: guideMentionJobSchema,
    singletonKey: (data) => data.event_id,
    async handler(data) {
      const { rows } = await withSystem(runtime.pool, (tx) =>
        tx.query<{ message_id: string | null }>(
          "SELECT payload->>'message_id' AS message_id FROM app.domain_event_for_routing($1)",
          [data.event_id],
        ),
      );
      const messageId = rows[0]?.message_id;
      if (messageId === undefined || messageId === null) return { outcome: 'no_event' };
      try {
        await runtime.assertRouteOn('guide.crew_mention');
        const prepared = await prepareCrewMention(
          crewTurnPorts(runtime),
          messageId,
          generateUuidV7(),
        );
        if (prepared === null) return { outcome: 'already_answered' };
        let outcome = 'answered';
        for await (const event of prepared.events) {
          if (event.type === 'error') outcome = event.code;
        }
        return { outcome };
      } catch (error) {
        if (error instanceof DomainError && error.code === 'QUOTA_EXHAUSTED') {
          return { outcome: 'quota_exhausted' };
        }
        if (error instanceof DomainError && error.code === 'STATE_INVALID') {
          return { outcome: 'switched_off' };
        }
        throw error;
      }
    },
  });
}
