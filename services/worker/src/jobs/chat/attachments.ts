/**
 * What the chat media jobs share: loading one message's attachments as app_system, writing a
 * derived object (registered in `media_objects` under the sender, like any upload) and patching
 * one attachment in place. Derived keys come from the message and media ids, so a retried job
 * overwrites the same object instead of leaving strays.
 */
import { createHash } from 'node:crypto';

import { withSystem } from '@cp/db';
import type { StoredAttachment } from '@cp/domain';
import type pg from 'pg';

import type { AvatarMediaStore } from '../avatar/media-store';

export type ChatMediaStore = AvatarMediaStore;

export interface ChatMediaMessage {
  readonly id: string;
  readonly crew_id: string;
  readonly sender_id: string;
  readonly attachments: StoredAttachment[];
}

export async function loadMediaMessage(
  pool: pg.Pool,
  messageId: string,
): Promise<ChatMediaMessage | undefined> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<ChatMediaMessage>(
      `SELECT id, crew_id, sender_id, attachments FROM messages
        WHERE id = $1 AND sender_kind = 'user' AND deleted_at IS NULL`,
      [messageId],
    );
    return rows[0];
  });
}

/** A stable media key under the sender's `purpose` prefix for one derived object. */
export function derivedKey(
  ownerId: string,
  purpose: 'photo' | 'voice',
  messageId: string,
  mediaId: string,
): string {
  const hex = createHash('sha256').update(`${messageId}:${mediaId}:derived`).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return `u/${ownerId}/${purpose}/${id}`;
}

export interface DerivedObject {
  readonly key: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly purpose: 'photo' | 'voice';
}

/**
 * Stores the derived object, registers it and merges `patch` into the attachment with `mediaId`,
 * unless the message was deleted or hidden meanwhile (then the object is left for account purge).
 */
export async function saveDerived(
  pool: pg.Pool,
  store: ChatMediaStore,
  message: ChatMediaMessage,
  mediaId: string,
  object: DerivedObject,
  patch: Partial<StoredAttachment>,
): Promise<boolean> {
  await store.put(object.key, object.bytes, object.contentType);
  const sha256 = createHash('sha256').update(object.bytes).digest('hex');
  return withSystem(pool, async (tx) => {
    await tx.query(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
       SELECT $1, $2, $3, $4, $5, $6
        WHERE NOT EXISTS (SELECT 1 FROM media_objects WHERE owner_id = $1 AND r2_key = $2)`,
      [
        message.sender_id,
        object.key,
        object.contentType,
        object.bytes.byteLength,
        sha256,
        object.purpose,
      ],
    );
    const { rowCount } = await tx.query(
      `UPDATE messages SET attachments = (
         SELECT jsonb_agg(CASE WHEN a->>'media_id' = $2 THEN a || $3::jsonb ELSE a END ORDER BY i)
           FROM jsonb_array_elements(attachments) WITH ORDINALITY AS t(a, i))
       WHERE id = $1 AND deleted_at IS NULL AND hidden_at IS NULL`,
      [message.id, mediaId, JSON.stringify({ ...patch, derived_key: object.key })],
    );
    return rowCount === 1;
  });
}
