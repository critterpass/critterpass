/**
 * `avatar.render`: bakes an approved photo avatar into circle PNGs at 40, 64, 120 and 240 px with
 * its ring (white outline for photos, the rarity colour for a ringed form), for the surfaces that
 * cannot draw the app's own avatar component (notification sender images, widgets, share sheets).
 *
 * Variant keys are derived from the avatar id and size, so a retried job overwrites the same
 * objects; each is registered in `media_objects` under the avatar's owner and recorded in
 * `avatars.variant_keys`, where crewmates' read URLs are minted from.
 */
import { createHash } from 'node:crypto';

import { withSystem } from '@cp/db';
import {
  AVATAR_RENDER_QUEUE,
  AVATAR_VARIANT_SIZES,
  avatarJobSchema,
  type AvatarRing,
  type AvatarVariantSize,
} from '@cp/domain';
import sharp from 'sharp';

import { defineJob, type JobDefinition } from '../../boss';
import type { AvatarMediaStore } from './media-store';

/** Rarity ring colours (docs/design-system.md); a photo without one gets the white cut-out outline. */
export const RING_COLOURS: Readonly<Record<AvatarRing | 'photo', string>> = {
  rare: '#4f86ff',
  epic: '#ff5fa8',
  legendary: '#ffd84a',
  photo: '#ffffff',
};

/** Ring width: about 5% of the diameter, never thinner than 2 px. */
export function ringWidth(size: number): number {
  return Math.max(2, Math.round(size / 20));
}

function circleSvg(size: number, fill: string): Buffer {
  const r = size / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="${fill}"/></svg>`,
  );
}

/** One circle PNG: the photo cropped to a disc inside a ring of `ringColour`. */
export async function renderVariant(
  source: Uint8Array,
  size: AvatarVariantSize,
  ringColour: string,
): Promise<Buffer> {
  const ring = ringWidth(size);
  const inner = size - 2 * ring;
  const disc = await sharp(source)
    .rotate()
    .resize(inner, inner, { fit: 'cover', position: 'attention' })
    .ensureAlpha()
    .composite([{ input: circleSvg(inner, '#fff'), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: circleSvg(size, ringColour), left: 0, top: 0 },
      { input: disc, left: ring, top: ring },
    ])
    .png()
    .toBuffer();
}

/** A stable media key per (avatar, size) under the owner's avatar prefix. */
export function variantKey(ownerId: string, avatarId: string, size: AvatarVariantSize): string {
  const hex = createHash('sha256').update(`${avatarId}:${size}`).digest('hex');
  const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return `u/${ownerId}/avatar/${id}`;
}

interface RenderableAvatar {
  readonly user_id: string;
  readonly media_key: string;
  readonly ring: AvatarRing | null;
}

export interface AvatarRenderOptions {
  readonly store: AvatarMediaStore;
}

export function avatarRenderJob(
  options: AvatarRenderOptions,
): JobDefinition<{ avatar_id: string }> {
  return defineJob({
    queue: AVATAR_RENDER_QUEUE,
    schema: avatarJobSchema,
    singletonKey: (data) => data.avatar_id,
    handler: async (data, ctx) => {
      const avatar = await withSystem(ctx.pool, async (tx) => {
        const { rows } = await tx.query<RenderableAvatar>(
          `SELECT user_id, media_key, ring FROM avatars
           WHERE id = $1 AND kind = 'photo' AND moderation_status = 'approved'`,
          [data.avatar_id],
        );
        return rows[0];
      });
      if (avatar === undefined) return { skipped: 'not_approved' };
      const source = await options.store.get(avatar.media_key);
      if (source === null) throw new Error(`avatar upload ${data.avatar_id} is missing`);

      const colour = RING_COLOURS[avatar.ring ?? 'photo'];
      const keys: Partial<Record<AvatarVariantSize, string>> = {};
      const objects: { key: string; bytes: number; sha256: string }[] = [];
      for (const size of AVATAR_VARIANT_SIZES) {
        const png = await renderVariant(source.bytes, size, colour);
        const key = variantKey(avatar.user_id, data.avatar_id, size);
        await options.store.put(key, png, 'image/png');
        keys[size] = key;
        objects.push({
          key,
          bytes: png.byteLength,
          sha256: createHash('sha256').update(png).digest('hex'),
        });
      }

      await withSystem(ctx.pool, async (tx) => {
        for (const object of objects) {
          await tx.query(
            `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
             SELECT $1, $2, 'image/png', $3, $4, 'avatar'
             WHERE NOT EXISTS (SELECT 1 FROM media_objects WHERE owner_id = $1 AND r2_key = $2)`,
            [avatar.user_id, object.key, object.bytes, object.sha256],
          );
        }
        await tx.query(
          `UPDATE avatars SET variant_keys = $2
           WHERE id = $1 AND moderation_status = 'approved'`,
          [data.avatar_id, JSON.stringify(keys)],
        );
      });
      return { sizes: AVATAR_VARIANT_SIZES.length };
    },
  });
}
