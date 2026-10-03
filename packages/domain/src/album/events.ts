/**
 * Album domain events. Payloads carry ids and counts only: no media key, no place, no face.
 */
import { z } from 'zod';

export const ALBUM_EVENT_TYPES = [
  'photo.added',
  'photo.deleted',
  'album.pick_changed',
  'album.export_requested',
  'album.export_ready',
  'album.curated',
] as const;
export type AlbumEventType = (typeof ALBUM_EVENT_TYPES)[number];

const photo = z.object({ trip_id: z.uuid(), photo_id: z.uuid() });
const albumExport = z.object({ trip_id: z.uuid(), export_id: z.uuid(), user_id: z.uuid() });

export const ALBUM_EVENT_PAYLOADS = {
  'photo.added': photo.extend({ uploader_id: z.uuid() }),
  'photo.deleted': photo,
  'album.pick_changed': photo.extend({ picked: z.boolean() }),
  'album.export_requested': albumExport,
  'album.export_ready': albumExport.extend({ photos: z.int().min(0) }),
  'album.curated': z.object({ trip_id: z.uuid(), picks: z.int().min(0) }),
} as const;
