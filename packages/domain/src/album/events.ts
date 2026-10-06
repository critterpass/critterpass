/**
 * Album and postcard domain events. Payloads carry ids, counts and statuses only: no media key, no
 * place, no face, no address.
 */
import { z } from 'zod';

export const ALBUM_EVENT_TYPES = [
  'photo.added',
  'photo.deleted',
  'album.pick_changed',
  'album.export_requested',
  'album.export_ready',
  'album.curated',
  'postcard.saved',
  'postcard.sent',
  'postcard.ordered',
  'postcard.address_requested',
  'postcard.address_saved',
  'postcard.mailing_updated',
] as const;
export type AlbumEventType = (typeof ALBUM_EVENT_TYPES)[number];

const photo = z.object({ trip_id: z.uuid(), photo_id: z.uuid() });
const postcard = z.object({ trip_id: z.uuid(), postcard_id: z.uuid() });
const albumExport = z.object({ trip_id: z.uuid(), export_id: z.uuid(), user_id: z.uuid() });

export const ALBUM_EVENT_PAYLOADS = {
  'photo.added': photo.extend({ uploader_id: z.uuid() }),
  'photo.deleted': photo,
  'album.pick_changed': photo.extend({ picked: z.boolean() }),
  'album.export_requested': albumExport,
  'album.export_ready': albumExport.extend({ photos: z.int().min(0) }),
  'album.curated': z.object({ trip_id: z.uuid(), picks: z.int().min(0) }),
  'postcard.saved': postcard,
  'postcard.sent': postcard.extend({ sender_id: z.uuid(), to_uids: z.array(z.uuid()).min(1) }),
  'postcard.ordered': postcard.extend({
    mailing_id: z.uuid(),
    payer_id: z.uuid(),
    recipient_ids: z.array(z.uuid()),
  }),
  'postcard.address_requested': postcard.extend({
    payer_id: z.uuid(),
    user_ids: z.array(z.uuid()).min(1),
  }),
  'postcard.address_saved': z.object({ user_id: z.uuid(), saved: z.boolean() }),
  'postcard.mailing_updated': z.object({
    trip_id: z.uuid(),
    mailing_id: z.uuid(),
    payer_id: z.uuid(),
    status: z.enum(['queued', 'sent', 'printed', 'shipped', 'failed']),
  }),
} as const;
