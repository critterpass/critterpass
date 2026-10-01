/**
 * `update_profile` (3n-3, docs/api-contracts.md §4.1): name, username and spoken languages. The
 * home airport has its own command (`set_home_airport`), the avatar its own (`set_avatar`).
 */
import { z } from 'zod';

import { USERNAME_MAX } from './username';

/** ISO 639-1/639-3 codes (optionally with a region or script subtag), deduplicated on write. */
const languageCode = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/, 'must be ISO 639');
export const PROFILE_LANGUAGES_MAX = 12;

export const updateProfilePayloadSchema = z
  .object({
    name: z.string().min(1).max(64),
    username: z
      .string()
      .min(1)
      .max(USERNAME_MAX + 8),
    languages: z.array(languageCode).max(PROFILE_LANGUAGES_MAX),
  })
  .partial()
  .strict()
  .refine((payload) => Object.keys(payload).length > 0, { message: 'nothing to update' });
export type UpdateProfilePayload = z.infer<typeof updateProfilePayloadSchema>;

export const PROFILE_FIELDS = ['display_name', 'username', 'languages', 'home_airport'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** `GET /v1/me/username-available?u=` */
export const usernameAvailabilitySchema = z.object({
  username: z.string(),
  available: z.boolean(),
  reason: z
    .enum(['too_short', 'too_long', 'invalid_chars', 'dots', 'reserved', 'taken'])
    .nullable(),
});
export type UsernameAvailability = z.infer<typeof usernameAvailabilitySchema>;
