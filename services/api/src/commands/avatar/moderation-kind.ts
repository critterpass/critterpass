/**
 * The `avatar` moderation subject (docs/api-contracts.md §4.17): photo avatars the moderation job
 * could not clear (hash matching not yet enrolled, or an uncertain classification) wait in the ops
 * queue. Approving releases the photo to the crew and bakes its PNG variants; removing rejects it,
 * so crewmates keep seeing initials and the owner sees `CONTENT_REJECTED` copy with a retry.
 */
import { sendInTx } from '@cp/db';
import { AVATAR_RENDER_QUEUE, type AvatarJob } from '@cp/domain';
import type pg from 'pg';

import { registerModerationKind } from '../../admin/moderation-intake';
import { announceMemberUpdated } from '../onboarding/member-updated';

export const AVATAR_MODERATION_KIND = 'avatar';

/** Moves a pending photo avatar to its verdict (as app_system); returns its owner when it moved. */
async function decide(
  tx: pg.PoolClient,
  id: string,
  status: 'approved' | 'rejected',
): Promise<string | null> {
  const { rows } = await tx.query<{ user_id: string }>(
    `UPDATE avatars SET moderation_status = $2, moderation_reason = $3
     WHERE id = $1 AND kind = 'photo' AND moderation_status = 'pending'
     RETURNING user_id`,
    [id, status, status === 'rejected' ? 'ops_review' : null],
  );
  return rows[0]?.user_id ?? null;
}

registerModerationKind({
  kind: AVATAR_MODERATION_KIND,
  verdicts: ['approve', 'remove'],
  exists: async (tx, id) =>
    (await tx.query("SELECT 1 FROM avatars WHERE id = $1 AND kind = 'photo'", [id])).rowCount === 1,
  preview: async (tx, id, media) => {
    const { rows } = await tx.query<{ media_key: string | null }>(
      'SELECT media_key FROM avatars WHERE id = $1',
      [id],
    );
    const key = rows[0]?.media_key;
    if (key === undefined || key === null) return { type: 'missing', title: 'Avatar photo' };
    return { type: 'image', title: 'Avatar photo', url: await media(key) };
  },
  author: async (tx, id) => {
    const { rows } = await tx.query<{ user_id: string }>(
      'SELECT user_id FROM avatars WHERE id = $1',
      [id],
    );
    return rows[0]?.user_id ?? null;
  },
  approve: async (tx, id) => {
    const owner = await decide(tx, id, 'approved');
    if (owner === null) return;
    const job: AvatarJob = { avatar_id: id };
    await sendInTx(tx, AVATAR_RENDER_QUEUE, job, { singletonKey: id });
    await announceMemberUpdated(tx, owner, ['avatar']);
  },
  apply: async (tx, id) => {
    const owner = await decide(tx, id, 'rejected');
    if (owner !== null) await announceMemberUpdated(tx, owner, ['avatar']);
  },
});
