/**
 * Identity and consent enums (docs/data-model.md §3.1, §3.17).
 */
import { z } from 'zod';

export const USER_STATUSES = ['anonymous', 'registered', 'closed', 'purged'] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const CONSENT_PURPOSES = [
  'dietary_visibility',
  'faces',
  'mailbox_surfacing',
  'insurance_to_clinic',
  'help_auto_share',
  'multi_member_publish',
  'visit_detection',
  'crew_phone_visible',
  'analytics',
  'marketing',
  'ai_voice',
] as const;
export const consentPurposeSchema = z.enum(CONSENT_PURPOSES);
export type ConsentPurpose = z.infer<typeof consentPurposeSchema>;

export const PRICE_DISPLAY_MODES = ['home', 'local', 'both'] as const;
export const priceDisplayModeSchema = z.enum(PRICE_DISPLAY_MODES);
export type PriceDisplayMode = z.infer<typeof priceDisplayModeSchema>;
