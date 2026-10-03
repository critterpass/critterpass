/**
 * `register_media_upload`: the internal command that records a `media_objects` row (docs/data-
 * model.md §3.10) for an upload the media routes authorised. Internal because only the server
 * knows the key it minted and the bytes R2 will accept at it; it runs as `app_system`, the only
 * role `media_objects` grants writes to, on behalf of the uploading user.
 */
import { DomainError, generateUuidV7, type CommandDevice } from '@cp/domain';
import { executeCommand } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import { defineCommand } from '../commands/_framework/define-command';
import type { CommandRegistry } from '../commands/_framework/registry';
import { parseMediaKey } from './purposes';

export const REGISTER_MEDIA_UPLOAD = 'register_media_upload';

const payloadSchema = z.object({
  media_key: z.string().min(1),
  content_type: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type RegisterMediaUploadPayload = z.infer<typeof payloadSchema>;

export const registerMediaUploadCommand = defineCommand({
  name: REGISTER_MEDIA_UPLOAD,
  v: 1,
  schema: payloadSchema,
  offline: false,
  allowAnonymous: true,
  internal: true,
  authorize: (_tx, payload, ctx) => {
    const parsed = parseMediaKey(payload.media_key);
    if (parsed === undefined || parsed.ownerId !== ctx.uid) {
      return Promise.reject(new DomainError('FORBIDDEN', { reason: 'foreign_media_key' }));
    }
    return Promise.resolve();
  },
  handle: async (tx, payload, ctx) => {
    const parsed = parseMediaKey(payload.media_key);
    // A completed multipart upload retried by the client registers once.
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
       SELECT $1, $2, $3, $4, $5, $6
        WHERE NOT EXISTS (SELECT 1 FROM media_objects WHERE owner_id = $1 AND r2_key = $2)
       RETURNING id`,
      [
        ctx.uid,
        payload.media_key,
        payload.content_type,
        payload.bytes,
        payload.sha256,
        parsed?.purpose ?? null,
      ],
    );
    const inserted = rows[0]?.id;
    if (inserted !== undefined) return { media_key: payload.media_key, media_id: inserted };
    const existing = await tx.query<{ id: string }>(
      'SELECT id FROM media_objects WHERE owner_id = $1 AND r2_key = $2',
      [ctx.uid, payload.media_key],
    );
    return { media_key: payload.media_key, media_id: existing.rows[0]?.id ?? null };
  },
});

const SERVER_DEVICE: CommandDevice = {
  id: 'api',
  platform: 'web',
  app_version: 'server',
  tz: 'UTC',
};

/**
 * Runs `register_media_upload` through the system door for `uid`; throws on any reject. Resolves to
 * the `media_objects` id (a command that needs a stored object, e.g. `save_signature`, names it).
 */
export async function registerMediaUpload(
  deps: { readonly pool: pg.Pool; readonly registry: CommandRegistry },
  uid: string,
  payload: RegisterMediaUploadPayload,
): Promise<string | null> {
  const outcome = await executeCommand(
    {
      op_id: generateUuidV7(),
      cmd: REGISTER_MEDIA_UPLOAD,
      v: 1,
      actor: { uid, via: 'system' },
      device: SERVER_DEVICE,
      client_ts: new Date().toISOString(),
      payload,
    },
    {
      pool: deps.pool,
      resolve: deps.registry.resolve,
      actor: { kind: 'system', uid },
      door: 'system',
    },
  );
  if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
  if (outcome.status !== 'applied') return null;
  const result = outcome.result as { readonly media_id?: unknown } | null | undefined;
  return typeof result?.media_id === 'string' ? result.media_id : null;
}
