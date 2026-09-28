/**
 * The `message` moderation subject (docs/api-contracts.md §4.17): a reported crew chat message.
 * `hide` and `remove` both set `hidden_at`, which takes the row out of RLS and the sync stream for
 * everyone, so every device drops it on its next sync; the crew is hinted to pull right away.
 */
import { outbox } from '@cp/db';
import { channelName, type StoredAttachment } from '@cp/domain';
import type pg from 'pg';

import { imagePreview, registerModerationKind } from '../../admin/moderation-intake';

export const MESSAGE_MODERATION_KIND = 'message';

async function hide(tx: pg.PoolClient, id: string): Promise<void> {
  const { rows } = await tx.query<{ crew_id: string }>(
    'UPDATE messages SET hidden_at = coalesce(hidden_at, now()) WHERE id = $1 RETURNING crew_id',
    [id],
  );
  const crewId = rows[0]?.crew_id;
  if (crewId === undefined) return;
  await outbox(tx, channelName('crew_chat', crewId), 'message.deleted', {
    crew_id: crewId,
    message_id: id,
  });
}

registerModerationKind({
  kind: MESSAGE_MODERATION_KIND,
  verdicts: ['approve', 'hide', 'remove', 'ban_author'],
  exists: async (tx, id) =>
    (await tx.query("SELECT 1 FROM messages WHERE id = $1 AND sender_kind = 'user'", [id]))
      .rowCount === 1,
  preview: async (tx, id, media) => {
    const { rows } = await tx.query<{ body: string; attachments: StoredAttachment[] }>(
      'SELECT body, attachments FROM messages WHERE id = $1',
      [id],
    );
    const message = rows[0];
    if (message === undefined) return { type: 'missing', title: 'Chat message' };
    const photo = message.attachments.find((attachment) => attachment.kind === 'photo');
    if (message.body === '' && photo !== undefined) {
      return imagePreview(tx, photo.media_id, 'Chat photo', media);
    }
    return { type: 'text', title: 'Chat message', text: message.body };
  },
  author: async (tx, id) => {
    const { rows } = await tx.query<{ sender_id: string | null }>(
      'SELECT sender_id FROM messages WHERE id = $1',
      [id],
    );
    return rows[0]?.sender_id ?? null;
  },
  apply: (tx, id) => hide(tx, id),
});
