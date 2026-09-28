/**
 * `set_avatar` (docs/api-contracts.md §4.1): records the caller's avatar choice under the client's
 * avatar id and makes it current (`users.avatar_id`).
 *
 * - Guide forms (`guide:<id>`) are always the caller's; any other critter form must be in their
 *   collection, else `FORBIDDEN`. Earned critter avatars are never gated behind a purchase.
 * - A photo is the caller's own upload (`u/<uid>/avatar/<id>` from the media presign) and starts
 *   `pending`: the moderation job is enqueued in the same transaction and crewmates see initials
 *   until it is approved.
 * - A replay of the same avatar id is a no-op; an id held by someone else is refused.
 */
import { appendDomainEvent, sendInTx } from '@cp/db';
import {
  AVATAR_MODERATE_QUEUE,
  avatarKeyOwner,
  DomainError,
  guideOfForm,
  ringOfForm,
  setAvatarPayloadSchema,
  type AvatarChoice,
  type AvatarJob,
  type AvatarModerationStatus,
} from '@cp/domain';
import type pg from 'pg';

import { defineCommand } from '../_framework/define-command';
import { announceMemberUpdated } from '../onboarding/member-updated';

export interface SetAvatarResult {
  readonly avatar_id: string;
  readonly moderation_status: AvatarModerationStatus;
}

/** Whether `formId` is the caller's to wear: a live guide, or a form in their collection. */
export async function ownsForm(tx: pg.PoolClient, uid: string, formId: string): Promise<boolean> {
  if (guideOfForm(formId) !== null) return true;
  const { rows } = await tx.query<{ present: boolean }>(
    "SELECT to_regclass('public.collection_entries') IS NOT NULL AS present",
  );
  if (rows[0]?.present !== true) return false;
  const owned = await tx.query(
    `SELECT 1 FROM collection_entries e JOIN critter_forms f ON f.id = e.form_id
     WHERE e.user_id = $1 AND f.key = $2 LIMIT 1`,
    [uid, formId],
  );
  return owned.rowCount === 1;
}

/** Refuses a choice the caller may not wear (unowned form, someone else's upload). */
export async function authorizeAvatarChoice(
  tx: pg.PoolClient,
  uid: string,
  choice: AvatarChoice,
): Promise<void> {
  if (choice.kind === 'critter' && !(await ownsForm(tx, uid, choice.form_id))) {
    throw new DomainError('FORBIDDEN', { reason: 'form_not_owned', form_id: choice.form_id });
  }
  if (choice.kind === 'photo' && avatarKeyOwner(choice.media_key) !== uid) {
    throw new DomainError('FORBIDDEN', { reason: 'foreign_media_key' });
  }
}

function columnsOf(choice: AvatarChoice) {
  return {
    formId: choice.kind === 'critter' ? choice.form_id : null,
    ring: choice.kind === 'critter' ? ringOfForm(choice.form_id) : null,
    mediaKey: choice.kind === 'photo' ? choice.media_key : null,
    status: (choice.kind === 'photo' ? 'pending' : 'none') as AvatarModerationStatus,
  };
}

/**
 * Inserts the avatar row (once) and makes it the caller's current avatar; emits the change and
 * enqueues photo moderation only when something actually changed. Used by `issue_pass` too.
 */
export async function writeAvatar(
  tx: pg.PoolClient,
  uid: string,
  avatarId: string,
  choice: AvatarChoice,
): Promise<SetAvatarResult & { readonly changed: boolean }> {
  const existing = await tx.query<{ user_id: string; moderation_status: AvatarModerationStatus }>(
    'SELECT user_id, moderation_status FROM avatars WHERE id = $1',
    [avatarId],
  );
  let status = existing.rows[0]?.moderation_status;
  const created = existing.rows[0] === undefined;
  if (!created && existing.rows[0]?.user_id !== uid) {
    throw new DomainError('VALIDATION', { reason: 'avatar_id_taken' });
  }
  if (created) {
    const row = columnsOf(choice);
    const inserted = await tx.query(
      `INSERT INTO avatars (id, user_id, kind, form_id, ring, media_key, moderation_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [avatarId, uid, choice.kind, row.formId, row.ring, row.mediaKey, row.status],
    );
    // Another user's row holds this id (hidden by RLS): never reveal it, never overwrite it.
    if (inserted.rowCount === 0) throw new DomainError('VALIDATION', { reason: 'avatar_id_taken' });
    status = row.status;
    if (choice.kind === 'photo') {
      const job: AvatarJob = { avatar_id: avatarId };
      await sendInTx(tx, AVATAR_MODERATE_QUEUE, job, { singletonKey: avatarId });
    }
  }

  const current = await tx.query(
    'UPDATE users SET avatar_id = $2 WHERE id = $1 AND avatar_id IS DISTINCT FROM $2',
    [uid, avatarId],
  );
  const changed = (current.rowCount ?? 0) > 0;
  if (changed) {
    await appendDomainEvent(tx, {
      type: 'profile.avatar_changed',
      aggregateKind: 'user',
      aggregateId: uid,
      actorKind: 'user',
      actorId: uid,
      payload: { user_id: uid, avatar_id: avatarId, kind: choice.kind },
    });
    await announceMemberUpdated(tx, uid, ['avatar']);
  }
  return { avatar_id: avatarId, moderation_status: status ?? 'none', changed };
}

export const setAvatarCommand = defineCommand({
  name: 'set_avatar',
  v: 1,
  schema: setAvatarPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload, ctx) => authorizeAvatarChoice(tx, ctx.uid, payload.choice),
  handle: async (tx, payload, ctx): Promise<SetAvatarResult> => {
    const written = await writeAvatar(tx, ctx.uid, payload.avatar_id, payload.choice);
    return { avatar_id: written.avatar_id, moderation_status: written.moderation_status };
  },
});
