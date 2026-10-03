/**
 * Realtime on `trip_album:{trip_id}` (docs/api-contracts-async.md §1): a photo dropping in once
 * its thumbnail is ready, a pick changing, the guide's curation done.
 */
import { z } from 'zod';

export const ALBUM_RT = {
  photoAdded: 'photo.added',
  photoPicked: 'photo.picked',
  curationDone: 'curation.done',
} as const;

export const albumPhotoAddedDataSchema = z.object({
  photo_id: z.uuid(),
  uploader_id: z.uuid(),
  thumb_key: z.string().nullable(),
});

export const albumPhotoPickedDataSchema = z.object({
  photo_id: z.uuid(),
  picked: z.boolean(),
  picked_by: z.enum(['user', 'guide']),
});

export const albumCurationDoneDataSchema = z.object({ picks: z.int().min(0) });
