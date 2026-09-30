/**
 * Dietary and accessibility profile (C3, owner only): `set_dietary_profile` writes it, and
 * `GET /v1/me/private/dietary` reads it back into the device's `local_private` store. The crew and
 * the guide never see the profile; they see only the derived `participant_dietary_flags` (the diet
 * and one `no_<allergen>` per allergy), and only while `visibility = crew_flags` and the owner's
 * `dietary_visibility` consent stands.
 */
import { z } from 'zod';

export const DIETS = ['none', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher'] as const;
export const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot'] as const;
export const DIETARY_VISIBILITIES = ['self', 'crew_flags'] as const;

const item = z.string().trim().min(1).max(40);

export const setDietaryProfilePayloadSchema = z.strictObject({
  diet: z.enum(DIETS).nullable().default(null),
  allergies: z.array(item).max(20).default([]),
  avoid: z.array(item).max(20).default([]),
  spice: z.enum(SPICE_LEVELS).nullable().default(null),
  accessibility_notes: z.string().trim().max(1000).nullable().default(null),
  /** `crew_flags` needs the `dietary_visibility` consent first (`CONSENT_REQUIRED`). */
  visibility: z.enum(DIETARY_VISIBILITIES).default('self'),
});
export type SetDietaryProfilePayload = z.infer<typeof setDietaryProfilePayloadSchema>;

export interface SetDietaryProfileResult {
  readonly visibility: (typeof DIETARY_VISIBILITIES)[number];
  /** Whether the crew now sees derived flags. */
  readonly flags_shared: boolean;
}

/** `GET /v1/me/private/dietary`: the owner's own profile, notes decrypted. */
export interface PrivateDietaryWire {
  readonly diet: (typeof DIETS)[number] | null;
  readonly allergies: readonly string[];
  readonly avoid: readonly string[];
  readonly spice: (typeof SPICE_LEVELS)[number] | null;
  readonly accessibility_notes: string | null;
  readonly visibility: (typeof DIETARY_VISIBILITIES)[number];
  readonly consent_at: string | null;
  readonly updated_at: string;
}

/** `claim_guide_offer`: I'M IN on a guide offer in crew chat. Books nothing by itself. */
export const claimGuideOfferPayloadSchema = z.strictObject({ offer_id: z.uuid() });

export interface ClaimGuideOfferResult {
  readonly offer_id: string;
  /** True when this member had already claimed a slot (the command is idempotent per member). */
  readonly already_claimed: boolean;
  readonly slots_taken: number;
  readonly slots_total: number;
}
