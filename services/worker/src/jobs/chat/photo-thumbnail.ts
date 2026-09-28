/**
 * `chat.photo_thumbnail`: a small JPEG (longest side 480 px) of each photo in a chat message, for
 * the timeline bubble; the full view reads the original. Also fills in the photo's size when the
 * sender's device did not send it.
 */
import { CHAT_PHOTO_THUMBNAIL_QUEUE, chatMediaJobSchema } from '@cp/domain';
import sharp from 'sharp';

import { defineJob, type JobDefinition } from '../../boss';
import { derivedKey, loadMediaMessage, saveDerived, type ChatMediaStore } from './attachments';

export const THUMBNAIL_MAX_PX = 480;

export async function renderThumbnail(
  bytes: Uint8Array,
): Promise<{ jpeg: Uint8Array; width: number | null; height: number | null }> {
  const image = sharp(bytes, { failOn: 'error' }).rotate();
  const meta = await image.metadata();
  const jpeg = await image
    .resize({
      width: THUMBNAIL_MAX_PX,
      height: THUMBNAIL_MAX_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = (rotated ? meta.height : meta.width) ?? null;
  const height = (rotated ? meta.width : meta.height) ?? null;
  return { jpeg: new Uint8Array(jpeg), width, height };
}

export function chatPhotoThumbnailJob(options: {
  readonly store: ChatMediaStore;
}): JobDefinition<{ message_id: string }> {
  return defineJob({
    queue: CHAT_PHOTO_THUMBNAIL_QUEUE,
    schema: chatMediaJobSchema,
    singletonKey: (data) => data.message_id,
    handler: async (data, ctx) => {
      const message = await loadMediaMessage(ctx.pool, data.message_id);
      if (message === undefined) return { skipped: 'gone' };
      let rendered = 0;
      for (const attachment of message.attachments) {
        if (attachment.kind !== 'photo' || attachment.derived_key) continue;
        const source = await options.store.get(attachment.media_key);
        if (source === null)
          throw new Error(`chat photo ${attachment.media_id} is not uploaded yet`);
        const thumb = await renderThumbnail(source.bytes);
        await saveDerived(
          ctx.pool,
          options.store,
          message,
          attachment.media_id,
          {
            key: derivedKey(message.sender_id, 'photo', message.id, attachment.media_id),
            bytes: thumb.jpeg,
            contentType: 'image/jpeg',
            purpose: 'photo',
          },
          { w: attachment.w ?? thumb.width, h: attachment.h ?? thumb.height },
        );
        rendered += 1;
      }
      return { rendered };
    },
  });
}
