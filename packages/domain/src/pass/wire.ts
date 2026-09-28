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

export const AVATAR_KINDS = ['initials', 'critter', 'photo'] as const;
export const AVATAR_MODERATION_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;
export type AvatarModerationStatus = (typeof AVATAR_MODERATION_STATUSES)[number];

export const avatarChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('initials') }).strict(),
  z.object({ kind: z.literal('critter'), form_id: formIdSchema }).strict(),
  z.object({ kind: z.literal('photo'), media_key: z.string().min(1).max(200) }).strict(),
]);
export type AvatarChoice = z.infer<typeof avatarChoiceSchema>;

const givenNameSchema = z
  .string()
  .trim()
  .min(1)
  .refine((name) => Array.from(name).length <= GIVEN_NAME_MAX * 4, { message: 'too long' });

export const startPassPayloadSchema = z.object({}).strict();
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
