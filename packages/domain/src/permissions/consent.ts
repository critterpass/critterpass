/**
 * `set_consent {purpose, granted, copy_version}`: the one write path for the consent rows the app
 * asks for itself (onboarding, Settings privacy rows, the visit consent sheet, the dietary consent
 * sheet "Share flags with your crew and guide?"). One row per user and purpose; a revocation keeps
 * the row with `revoked_at` set.
 */
import { z } from 'zod';

export const SETTABLE_CONSENT_PURPOSES = [
  'visit_detection',
  'analytics',
  'marketing',
  'dietary_visibility',
  // "Share where I am with the crew for 1 hour when I open Help": off until turned on.
  'help_auto_share',
] as const;
export const settableConsentPurposeSchema = z.enum(SETTABLE_CONSENT_PURPOSES);
export type SettableConsentPurpose = z.infer<typeof settableConsentPurposeSchema>;

export const setConsentPayloadSchema = z.object({
  purpose: settableConsentPurposeSchema,
  granted: z.boolean(),
  /** The copy the user saw, e.g. `visit-2026-09`; kept as evidence of what they agreed to. */
  copy_version: z
    .string()
    .regex(/^[a-z0-9][a-z0-9._-]{0,39}$/u)
    .optional(),
});
export type SetConsentPayload = z.infer<typeof setConsentPayloadSchema>;

export interface SetConsentResult {
  readonly purpose: SettableConsentPurpose;
  readonly granted: boolean;
}

/** Copy version of the visit consent sheet the app ships ("places you checked in at" copy). */
export const VISIT_CONSENT_COPY_VERSION = 'visits-2026-09';
