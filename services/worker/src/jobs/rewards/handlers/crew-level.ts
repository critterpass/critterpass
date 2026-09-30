/**
 * Crew level-ups: `app.grant_xp` grants a crew-level sticker for every even level a grant crosses
 * (once per crew per level, in the grant's transaction). This announces each new one: a
 * `sticker.granted` event and a `reward` hint on the trip's quest channel, revealed on every phone
 * at the same `reveal_at`.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { channelName, QUESTS_RT, revealAt, type QuestRewardHint } from '@cp/domain';
import type pg from 'pg';

export interface LevelUp {
  readonly crewId: string;
  readonly tripId: string | null;
  readonly stickerIds: readonly string[];
  readonly at: Date;
}

export async function announceLevelUps(tx: pg.PoolClient, levelUp: LevelUp): Promise<number> {
  if (levelUp.stickerIds.length === 0) return 0;
  const { rows } = await tx.query<{ id: string; level: number }>(
    'SELECT id, level FROM stickers WHERE id = ANY ($1::uuid[]) ORDER BY level',
    [levelUp.stickerIds],
  );
  const reveal = revealAt(levelUp.at).toISOString();
  for (const sticker of rows) {
    await appendDomainEvent(tx, {
      type: 'sticker.granted',
      aggregateKind: 'sticker',
      aggregateId: sticker.id,
      actorKind: 'system',
      actorId: null,
      crewId: levelUp.crewId,
      tripId: levelUp.tripId,
      payload: {
        sticker_id: sticker.id,
        crew_id: levelUp.crewId,
        trip_id: levelUp.tripId,
        kind: 'crew_level',
        level: sticker.level,
      },
    });
    if (levelUp.tripId === null) continue;
    const hint: QuestRewardHint = {
      kind: 'crew_level',
      quest_id: null,
      sticker_id: sticker.id,
      xp: 0,
      level: sticker.level,
      reveal_at: reveal,
    };
    await outbox(tx, channelName('trip_quests', levelUp.tripId), QUESTS_RT.reward, hint);
  }
  return rows.length;
}
