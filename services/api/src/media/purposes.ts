/**
 * Upload purposes (docs/api-contracts.md §5.4): which content types each accepts, how large an
 * original may be, and the object-key layout `u/<uid>/<purpose>/<uuidv7>`. The key embeds the
 * owner, so ownership checks never need a lookup and `media_objects` reads stay on its owner index.
 */
import { DomainError, generateUuidV7 } from '@cp/domain';
import { z } from 'zod';

export const MEDIA_PURPOSES = [
  'avatar',
  'photo',
  'receipt',
  'menu',
  'booking_doc',
  'feedback',
] as const;
export const mediaPurposeSchema = z.enum(MEDIA_PURPOSES);
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;

const MiB = 1024 * 1024;

/** Single presigned PUT ceiling; larger originals go through multipart. */
export const SINGLE_PUT_MAX_BYTES = 5 * MiB;
/** S3/R2 minimum for every part except the last. */
export const MULTIPART_MIN_PART_BYTES = 5 * MiB;
export const MULTIPART_PART_BYTES = 8 * MiB;

const IMAGES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

interface PurposeRule {
  readonly contentTypes: readonly string[];
  readonly maxBytes: number;
}

// Sizes cover full-resolution phone originals (photos), multi-page scans (documents) and short
// screen recordings (feedback); avatars are cropped on device before upload.
const PURPOSE_RULES: Record<MediaPurpose, PurposeRule> = {
  avatar: { contentTypes: IMAGES, maxBytes: 5 * MiB },
  photo: { contentTypes: IMAGES, maxBytes: 50 * MiB },
  receipt: { contentTypes: [...IMAGES, 'application/pdf'], maxBytes: 10 * MiB },
  menu: { contentTypes: IMAGES, maxBytes: 10 * MiB },
  booking_doc: { contentTypes: [...IMAGES, 'application/pdf'], maxBytes: 20 * MiB },
  feedback: { contentTypes: [...IMAGES, 'video/mp4', 'video/quicktime'], maxBytes: 50 * MiB },
};

export function purposeRule(purpose: MediaPurpose): PurposeRule {
  return PURPOSE_RULES[purpose];
}

/** `VALIDATION` for a content type the purpose does not take; `PAYLOAD_TOO_LARGE` past its cap. */
export function assertUploadAllowed(
  purpose: MediaPurpose,
  contentType: string,
  bytes: number,
): void {
  const rule = PURPOSE_RULES[purpose];
  if (!rule.contentTypes.includes(contentType)) {
    throw new DomainError('VALIDATION', {
      reason: 'content_type_not_allowed',
      allowed: rule.contentTypes,
    });
  }
  if (bytes > rule.maxBytes) {
    throw new DomainError('PAYLOAD_TOO_LARGE', { max_bytes: rule.maxBytes });
  }
}

export function newMediaKey(uid: string, purpose: MediaPurpose): string {
  return `u/${uid}/${purpose}/${generateUuidV7()}`;
}

export interface ParsedMediaKey {
  readonly ownerId: string;
  readonly purpose: MediaPurpose;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const MEDIA_KEY_PATTERN = new RegExp(`^u/(${UUID})/(${MEDIA_PURPOSES.join('|')})/(${UUID})$`);

/** `undefined` for anything that is not a key this service minted. */
export function parseMediaKey(key: string): ParsedMediaKey | undefined {
  const match = MEDIA_KEY_PATTERN.exec(key);
  if (match === null) return undefined;
  const [, ownerId, purpose] = match;
  if (ownerId === undefined || purpose === undefined) return undefined;
  return { ownerId, purpose: mediaPurposeSchema.parse(purpose) };
}
