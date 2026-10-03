/**
 * Album command payloads (docs/api-contracts.md §4.14 and doc deltas): registering an uploaded
 * photo, deleting one, picking or unpicking, tagging oneself, the automatic-ingest switch and
 * "download all".
 */
import { z } from 'zod';

import { photoQualitySchema } from './schema';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);

/** After the upload: the photo's own id (made offline), its media key and what the device saw. */
export const registerPhotoPayloadSchema = z.strictObject({
  photo_id: z.uuid(),
  trip_id: z.uuid(),
  media_key: z.string().min(1).max(300),
  sha256,
  phash: z
    .string()
    .regex(/^[0-9a-f]{16}$/u)
    .optional(),
  taken_at: z.iso.datetime({ offset: true }).optional(),
  width: z.int().positive().max(20_000).optional(),
  height: z.int().positive().max(20_000).optional(),
  quality: photoQualitySchema.optional(),
  /** The device removed the GPS tags before upload (C25); the server checks again. */
  exif_gps_stripped: z.boolean().default(false),
  faces_opt_in: z.boolean().default(false),
});
export type RegisterPhotoPayload = z.infer<typeof registerPhotoPayloadSchema>;

export interface RegisterPhotoResult {
  readonly photo_id: string;
  /** The trip's photo with the same bytes, when this one was a duplicate (registered once). */
  readonly duplicate_of: string | null;
}

export const deletePhotoPayloadSchema = z.strictObject({ photo_id: z.uuid() });
export type DeletePhotoPayload = z.infer<typeof deletePhotoPayloadSchema>;

export const setAlbumPickPayloadSchema = z.strictObject({
  photo_id: z.uuid(),
  picked: z.boolean(),
});
export type SetAlbumPickPayload = z.infer<typeof setAlbumPickPayloadSchema>;

export const tagSelfInPhotoPayloadSchema = z.strictObject({
  photo_id: z.uuid(),
  on: z.boolean(),
  source: z.enum(['self_match', 'manual']).default('manual'),
});
export type TagSelfInPhotoPayload = z.infer<typeof tagSelfInPhotoPayloadSchema>;

export const setAlbumAutoIngestPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  on: z.boolean(),
});
export type SetAlbumAutoIngestPayload = z.infer<typeof setAlbumAutoIngestPayloadSchema>;

/** `export_id`: the app's id for the export row, so a replay finds it. */
export const requestAlbumExportPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  export_id: z.uuid(),
});
export type RequestAlbumExportPayload = z.infer<typeof requestAlbumExportPayloadSchema>;
