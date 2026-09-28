/**
 * Onboarding and avatar command payloads (docs/api-contracts.md §4.1): `start_pass`, `issue_pass`,
 * `set_taste`, `set_home_airport`, `set_avatar`, and the `GET /v1/geo/hint` response.
 */
import { z } from 'zod';

import { iataSchema } from '../airports/types';
import { tasteAnswerSchema } from '../taste/quiz-to-tags';
import { GIVEN_NAME_MAX } from './name';

/** The six live guides a new pass can wear before any critter is collected. */
export const ONBOARDING_GUIDES = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'] as const;
export type OnboardingGuide = (typeof ONBOARDING_GUIDES)[number];

/** Guide avatars are critter avatars on the guide's own form, `guide:<id>`; always owned. */
export const GUIDE_FORM_PREFIX = 'guide:';
export function guideFormId(guide: OnboardingGuide): string {
  return `${GUIDE_FORM_PREFIX}${guide}`;
}
export function guideOfForm(formId: string): OnboardingGuide | null {
  if (!formId.startsWith(GUIDE_FORM_PREFIX)) return null;
  const id = formId.slice(GUIDE_FORM_PREFIX.length);
  return (ONBOARDING_GUIDES as readonly string[]).includes(id) ? (id as OnboardingGuide) : null;
}

const formIdSchema = z
  .string()
  .regex(/^(?:guide:[a-z]+|cp-\d{3}:(?:common|rare|epic|legendary))$/u, 'must be a form id');

/** A critter form's rarity ring; guide forms and common forms wear none. */
export type AvatarRing = 'rare' | 'epic' | 'legendary';
export function ringOfForm(formId: string): AvatarRing | null {
  const tier = /^cp-\d{3}:(rare|epic|legendary)$/u.exec(formId)?.[1];
  return (tier as AvatarRing | undefined) ?? null;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** The key `POST /v1/media/presign` returns for `purpose: avatar`: `u/<uid>/avatar/<uuidv7>`. */
export const AVATAR_MEDIA_KEY_PATTERN = new RegExp(`^u/(${UUID})/avatar/${UUID}$`, 'u');
export const avatarMediaKeySchema = z
  .string()
  .regex(AVATAR_MEDIA_KEY_PATTERN, 'must be an avatar media key');
/** The uploader a key names, or null for anything that is not an avatar key. */
export function avatarKeyOwner(mediaKey: string): string | null {
  return AVATAR_MEDIA_KEY_PATTERN.exec(mediaKey)?.[1] ?? null;
}

export const AVATAR_KINDS = ['initials', 'critter', 'photo'] as const;
export const AVATAR_MODERATION_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;
export type AvatarModerationStatus = (typeof AVATAR_MODERATION_STATUSES)[number];

export const avatarChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('initials') }).strict(),
  z.object({ kind: z.literal('critter'), form_id: formIdSchema }).strict(),
  z.object({ kind: z.literal('photo'), media_key: avatarMediaKeySchema }).strict(),
]);
export type AvatarChoice = z.infer<typeof avatarChoiceSchema>;

const givenNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => Array.from(name).length <= GIVEN_NAME_MAX * 4, { message: 'too long' });

export const startPassPayloadSchema = z
  .object({
    /** The client's pass id, so a later `issue_pass` (online or replayed) lands on the same row. */
    pass_id: z.uuid().optional(),
  })
  .strict();
export interface StartPassResult {
  readonly pass_id: string;
  readonly number: string;
}

export const issuePassPayloadSchema = z
  .object({
    /** Client-minted, so an offline issue and its later replay land on one row. */
    pass_id: z.uuid(),
    given_name: givenNameSchema,
    avatar: avatarChoiceSchema,
    taste_answers: z.array(tasteAnswerSchema).max(12),
    home_iata: iataSchema,
  })
  .strict();
export type IssuePassPayload = z.infer<typeof issuePassPayloadSchema>;
export interface IssuePassResult {
  readonly pass_id: string;
  readonly number: string;
  readonly issued_at: string;
}

export const setTastePayloadSchema = z
  .object({
    answers: z.array(tasteAnswerSchema).max(12),
    source: z.enum(['quiz', 'chips']).default('quiz'),
  })
  .strict();
export type SetTastePayload = z.infer<typeof setTastePayloadSchema>;

export const setHomeAirportPayloadSchema = z.object({ iata: iataSchema }).strict();
export type SetHomeAirportPayload = z.infer<typeof setHomeAirportPayloadSchema>;

export const setAvatarPayloadSchema = z
  .object({
    /** Client-minted avatar row id. */
    avatar_id: z.uuid(),
    choice: avatarChoiceSchema,
  })
  .strict();
export type SetAvatarPayload = z.infer<typeof setAvatarPayloadSchema>;

/** `GET /v1/geo/hint`: IP-derived, city level at best; never a GPS fix. */
export const geoHintSchema = z
  .object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/u)
      .nullable(),
    city: z.string().max(80).nullable(),
    /** City centre, rounded to 0.1°, for the "40 min away" line. */
    point: z.object({ lat: z.number(), lng: z.number() }).nullable(),
    nearest_iata: z.array(iataSchema).max(5),
  })
  .strict();
export type GeoHint = z.infer<typeof geoHintSchema>;

/** Pixel sizes `avatar.render` bakes for OS surfaces (NSE sender images, widgets, share sheets). */
export const AVATAR_VARIANT_SIZES = [40, 64, 120, 240] as const;
export type AvatarVariantSize = (typeof AVATAR_VARIANT_SIZES)[number];

/** Jobs a photo avatar goes through: moderation, then (once approved) its PNG variants. */
export const AVATAR_MODERATE_QUEUE = 'avatar.moderate';
export const AVATAR_RENDER_QUEUE = 'avatar.render';
/** `ops_config` switch for the known-image hash match that runs before any model sees a photo. */
export const AVATAR_HASH_MATCH_CONFIG_KEY = 'moderation.hash_match';
export const avatarJobSchema = z.object({ avatar_id: z.uuid() }).strict();
export type AvatarJob = z.infer<typeof avatarJobSchema>;
