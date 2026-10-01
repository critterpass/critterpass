/**
 * `grant_quest_reward` (system door only): finishes a live quest and grants its XP to the crew and
 * the given travellers still on the trip, through `app.grant_quest_reward` (once, under the quest's
 * row lock, so the evaluator and this door can never both pay). The reward reveals on every phone
 * at the shared `reveal_at`; crew-level stickers the XP unlocks are announced with it.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import {
  channelName,
  grantQuestRewardPayloadSchema,
  QUESTS_RT,
  revealAt,
  type QuestRewardHint,
} from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

interface Granted {
  readonly completed: boolean;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly xp: number;
  readonly user_ids: string[];
  readonly level_before: number | null;
  readonly level_after: number | null;
  readonly sticker_ids: string[];
}

export const grantQuestRewardCommand = defineCommand({
  name: 'grant_quest_reward',
  v: 1,
  schema: grantQuestRewardPayloadSchema,
  offline: false,
  internal: true,
  authorize: () => Promise.resolve(),
  handle: (tx, payload) =>
    asSystemRole(tx, async () => {
      const now = new Date();
      const reveal = revealAt(now);
      const { rows } = await tx.query<Granted>(
        'SELECT * FROM app.grant_quest_reward($1, $2::uuid[], $3, $4)',
        [payload.quest_id, payload.uids, now, reveal],
      );
      const done = rows[0];
      if (done === undefined || !done.completed) {
        return { quest_id: payload.quest_id, completed: false };
      }
      const base = { actorKind: 'system' as const, actorId: null, crewId: done.crew_id };
      await appendDomainEvent(tx, {
        ...base,
        type: 'quest.completed',
        aggregateKind: 'quest',
        aggregateId: payload.quest_id,
        tripId: done.trip_id,
        payload: {
          trip_id: done.trip_id,
          quest_id: payload.quest_id,
          user_ids: done.user_ids,
          xp: done.xp,
          reveal_at: reveal.toISOString(),
        },
      });
      await appendDomainEvent(tx, {
        ...base,
        type: 'xp.granted',
        aggregateKind: 'crew',
        aggregateId: done.crew_id,
        tripId: done.trip_id,
        payload: {
          crew_id: done.crew_id,
          trip_id: done.trip_id,
          source_kind: 'quest',
          source_id: payload.quest_id,
          amount: done.xp,
          user_ids: done.user_ids,
          level_before: done.level_before,
          level_after: done.level_after,
        },
      });
      const channel = channelName('trip_quests', done.trip_id);
      const stickers = await tx.query<{ id: string; level: number }>(
        'SELECT id, level FROM stickers WHERE id = ANY ($1::uuid[]) ORDER BY level',
        [done.sticker_ids],
      );
      for (const sticker of stickers.rows) {
        await appendDomainEvent(tx, {
          ...base,
          type: 'sticker.granted',
          aggregateKind: 'sticker',
          aggregateId: sticker.id,
          tripId: done.trip_id,
          payload: {
            sticker_id: sticker.id,
            crew_id: done.crew_id,
            trip_id: done.trip_id,
            kind: 'crew_level',
            level: sticker.level,
          },
        });
        const levelHint: QuestRewardHint = {
          kind: 'crew_level',
          quest_id: null,
          sticker_id: sticker.id,
          xp: 0,
          level: sticker.level,
          reveal_at: reveal.toISOString(),
        };
        await outbox(tx, channel, QUESTS_RT.reward, levelHint);
      }
      await outbox(tx, channel, QUESTS_RT.completed, { quest_id: payload.quest_id });
      const hint: QuestRewardHint = {
        kind: 'quest',
        quest_id: payload.quest_id,
        sticker_id: null,
        xp: done.xp,
        level: done.level_after,
        reveal_at: reveal.toISOString(),
      };
      await outbox(tx, channel, QUESTS_RT.reward, hint);
      return { quest_id: payload.quest_id, completed: true, reveal_at: reveal.toISOString() };
    }),
});
