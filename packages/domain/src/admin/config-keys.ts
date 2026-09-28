/**
 * Typed `ops.ops_config` keys: the only keys `set_feature_flag` accepts, each with its value
 * schema, whether it projects to the synced `client_config` (public), whether the console asks for
 * a typed two-step confirm (critical), and whether another command owns it (the supplier switches
 * follow `set_partner_adapter`, so app copy and adapter state never drift apart).
 */
import { z } from 'zod';

import { APP_CLIP_FLAG_KEY } from '../links/wire';
import { AVATAR_HASH_MATCH_CONFIG_KEY } from '../pass/wire';
import { adminAuditViaSchema, auditChangeSchema } from './audit-detail';
import { flagAudienceSchema } from './flag-audience';
import { PARTNER_KEYS, partnerCopyModeSchema, type PartnerKey } from './ops-enums';

export interface ConfigKeyDefinition {
  readonly schema: z.ZodType;
  readonly isPublic: boolean;
  readonly critical: boolean;
  readonly description: string;
  readonly managedBy?: 'partners';
}

const limit = (max: number) => z.number().int().min(0).max(max);

function supplierKeys(partner: PartnerKey): Record<string, ConfigKeyDefinition> {
  return {
    [`supplier.${partner}.enabled`]: {
      schema: z.boolean(),
      isPublic: true,
      critical: true,
      description: `Whether the ${partner} adapter is live`,
      managedBy: 'partners',
    },
    [`supplier.${partner}.copy_mode`]: {
      schema: partnerCopyModeSchema,
      isPublic: true,
      critical: true,
      description: `App copy for ${partner}: link or in-app booking`,
      managedBy: 'partners',
    },
  };
}

export const CONFIG_KEYS: Readonly<Record<string, ConfigKeyDefinition>> = {
  'guide.free_daily_limit': {
    schema: limit(1000),
    isPublic: true,
    critical: true,
    description: 'Free guide turns per user per day',
  },
  'seat.cap_free': {
    schema: limit(100),
    isPublic: true,
    critical: true,
    description: 'Crew seats without a boost',
  },
  'seat.cap_boost': {
    schema: limit(100),
    isPublic: true,
    critical: true,
    description: 'Crew seats with a boost',
  },
  'redraft.limit_free': {
    schema: limit(100),
    isPublic: true,
    critical: false,
    description: 'Free redrafts per trip',
  },
  'billing.grace_days': {
    schema: limit(60),
    isPublic: false,
    critical: true,
    description: 'Days a lapsed subscription keeps its perks',
  },
  'fair_use.guide_turns_per_user_day': {
    schema: limit(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: guide turns per user per day',
  },
  'fair_use.crew_chat_per_crew_day': {
    schema: limit(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: crew chat guide replies per crew per day',
  },
  'fair_use.redrafts_per_trip_day': {
    schema: limit(10_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: redrafts per trip per day',
  },
  'fair_use.system_jobs_per_trip_day': {
    schema: limit(10_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: system jobs per trip per day',
  },
  'perks.catalogue_version': {
    schema: z.string().min(1).max(64),
    isPublic: true,
    critical: false,
    description: 'Which server-driven perk list the app shows',
  },
  [AVATAR_HASH_MATCH_CONFIG_KEY]: {
    schema: z.boolean(),
    isPublic: false,
    critical: true,
    description:
      'Known-image hash matching runs on photo avatars (on once the vendor enrolment is live); off = every photo waits for ops review',
  },
  [APP_CLIP_FLAG_KEY]: {
    schema: z.boolean(),
    isPublic: true,
    critical: false,
    description: 'Offer the iOS App Clip on invite pages (AASA appclips entry and banner card)',
  },
  ...Object.fromEntries(PARTNER_KEYS.flatMap((partner) => Object.entries(supplierKeys(partner)))),
};

export function configKey(key: string): ConfigKeyDefinition | undefined {
  return Object.hasOwn(CONFIG_KEYS, key) ? CONFIG_KEYS[key] : undefined;
}

export function supplierFlagKeys(partner: PartnerKey): { enabled: string; copyMode: string } {
  return { enabled: `supplier.${partner}.enabled`, copyMode: `supplier.${partner}.copy_mode` };
}

/** The `catalog` realtime channel clients listen on to refetch `client_config` and catalogues. */
export const CATALOG_CHANNEL = 'catalog';

export const setFeatureFlagPayloadSchema = z
  .object({
    key: z.string().min(1).max(128),
    value: z.unknown(),
    audience: flagAudienceSchema,
    /** The version the operator edited; `0` when the key has no row yet. */
    version: z.number().int().min(0),
    /** Why, kept in `ops.admin_audit.reason` and shown in the key's history. */
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict();
export type SetFeatureFlagPayload = z.infer<typeof setFeatureFlagPayloadSchema>;

export const adminFlagSchema = z.object({
  key: z.string(),
  description: z.string(),
  is_public: z.boolean(),
  critical: z.boolean(),
  managed_by: z.enum(['partners']).nullable(),
  value: z.unknown(),
  audience: flagAudienceSchema,
  version: z.number().int(),
  /** What the app currently syncs for this key; null when not projected. */
  client_value: z.unknown(),
  updated_at: z.string().nullable(),
  updated_by: z.string().nullable(),
});
export type AdminFlag = z.infer<typeof adminFlagSchema>;
export const adminFlagsResponseSchema = z.object({ items: z.array(adminFlagSchema) });

/** One `set_feature_flag` of a key, newest first in `GET /v1/admin/flags/{key}/history`. */
export const flagHistoryEntrySchema = z.object({
  at: z.iso.datetime({ offset: true }),
  admin: z.string(),
  summary: z.string(),
  changes: z.array(auditChangeSchema),
  reason: z.string().nullable(),
  via: adminAuditViaSchema.nullable(),
});
export type FlagHistoryEntry = z.infer<typeof flagHistoryEntrySchema>;
export const flagHistoryResponseSchema = z.object({ items: z.array(flagHistoryEntrySchema) });
