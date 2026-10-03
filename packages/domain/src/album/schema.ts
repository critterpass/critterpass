/**
 * The album's shapes (docs/data-model.md §3.10 `photos`): the device prefilter's scores a photo
 * arrives with. Scores are numbers the device computed (`cp-photo-analysis`); faces are counted
 * only, never described or stored.
 */
import { z } from 'zod';

export const PHOTO_UPLOAD_STATES = ['pending', 'uploaded', 'processed', 'failed'] as const;
export const photoUploadStateSchema = z.enum(PHOTO_UPLOAD_STATES);
export type PhotoUploadState = z.infer<typeof photoUploadStateSchema>;

/** `photos.quality`: blur (Laplacian variance, 0 = very blurry), exposure (0–1, 0.5 = even). */
export const photoQualitySchema = z.strictObject({
  blur: z.number().min(0).max(100_000).optional(),
  exposure: z.number().min(0).max(1).optional(),
  /** Near-duplicate cluster on the uploader's device (pHash distance). */
  dup_cluster: z.string().min(1).max(64).optional(),
  face_count: z.int().min(0).max(100).optional(),
});
export type PhotoQuality = z.infer<typeof photoQualitySchema>;

export const POSTCARD_FORMATS = ['classic', 'square', 'story'] as const;
export const postcardFormatSchema = z.enum(POSTCARD_FORMATS);

/** How long an album export's download stays readable. */
export const ALBUM_EXPORT_DAYS = 7;
/** Longest side of a photo's thumbnail and of its display copy, in pixels. */
export const ALBUM_THUMB_PX = 480;
export const ALBUM_DISPLAY_PX = 1600;
