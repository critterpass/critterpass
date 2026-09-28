/**
 * Typed `ops.ops_config` keys: the only keys `set_feature_flag` accepts, each with its value
 * schema, whether it projects to the synced `client_config` (public), whether the console asks for
 * a typed two-step confirm (critical), and whether another command owns it (the supplier switches
 * follow `set_partner_adapter`, so app copy and adapter state never drift apart).
 *
 * Each key belongs to a console group; `services` keys (kill switches, spend caps, desk and
 * moderation timings) are edited on the services screen, not the flags list. A key's `roles`
 * narrow who may change it below the command's own roles (tier switches and spend caps: owner).
 */
import { z } from 'zod';

import { AI_ROUTES, GENERATION_TIERS } from '../ai/routes';
import { APP_CLIP_FLAG_KEY } from '../links/wire';
import { AVATAR_HASH_MATCH_CONFIG_KEY } from '../pass/wire';
import { flagAudienceSchema } from './flag-audience';
import { PARTNER_KEYS, partnerCopyModeSchema, type PartnerKey } from './ops-enums';
import { adminRoleSchema, type AdminRole } from './roles';

export const CONFIG_KEY_GROUPS = [
  'limits',
  'fair_use',
  'billing',
  'suppliers',
  'services',
] as const;
export type ConfigKeyGroup = (typeof CONFIG_KEY_GROUPS)[number];

export interface ConfigKeyDefinition {
  readonly schema: z.ZodType;
  readonly isPublic: boolean;
  readonly critical: boolean;
  readonly description: string;
  readonly group: ConfigKeyGroup;
  /** Who may change this key; absent = whoever may run `set_feature_flag`. */
  readonly roles?: readonly AdminRole[];
  /** A short operator hint shown beside the key. */
  readonly note?: string;
  readonly managedBy?: 'partners';
}

const limit = (max: number) => z.number().int().min(0).max(max);
const usd = z.number().min(0).max(1_000_000);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/** OTP sender channels a switch can turn off (`otp.<channel>.enabled`). */
export const OTP_SWITCH_CHANNELS = ['whatsapp', 'twilio_verify', 'prelude'] as const;
/** Live Activity / Live Update kinds a switch can turn off (`la.<kind>.enabled`). */
export const LIVE_ACTIVITY_SWITCH_KINDS = [
  'leave_by',
  'meet_up',
  'flight',
  'vote',
  'critter_nearby',
  'storm',
  'sos',
  'alarm',
] as const;

const OWNER_ONLY: readonly AdminRole[] = ['owner'];

function killSwitch(description: string, roles?: readonly AdminRole[]): ConfigKeyDefinition {
  return {
    schema: z.boolean(),
    isPublic: false,
    critical: true,
    description,
    group: 'services',
    note: 'Off returns STATE_INVALID switched_off; the app shows its fallback',
    ...(roles !== undefined ? { roles } : {}),
  };
}

function spendCap(description: string): ConfigKeyDefinition {
  return {
    schema: usd,
    isPublic: false,
    critical: true,
    description,
    group: 'services',
    roles: OWNER_ONLY,
    note: 'Alert at 80 %, pause at 100 %; never re-routes to another model',
  };
}

/** Kill switches, spend caps and ops timings: the services group. */
function serviceKeys(): Record<string, ConfigKeyDefinition> {
  return {
    ...Object.fromEntries(
      AI_ROUTES.map((route) => [`ai.${route}.enabled`, killSwitch(`AI route ${route}`)]),
    ),
    ...Object.fromEntries(
      GENERATION_TIERS.map((tier) => [
        `ai.tier.${tier}.enabled`,
        killSwitch(`Every AI route on the ${tier} tier`, OWNER_ONLY),
      ]),
    ),
    ...Object.fromEntries(
      OTP_SWITCH_CHANNELS.map((channel) => [
        `otp.${channel}.enabled`,
        killSwitch(`Sign-in codes over ${channel}`),
      ]),
    ),
    ...Object.fromEntries(
      LIVE_ACTIVITY_SWITCH_KINDS.map((kind) => [
        `la.${kind}.enabled`,
        killSwitch(`Live Activity pushes for ${kind}`),
      ]),
    ),
    'signup.enabled': killSwitch('New account sign-ups'),
    'billing.enabled': killSwitch('Purchases and plan changes', OWNER_ONLY),
    'postcards.enabled': killSwitch('Printed postcard orders'),
    'widgets.push.enabled': killSwitch('Widget refresh pushes'),
    'android.fsi.enabled': killSwitch('Android full-screen intent alerts'),
    'ai.cap.daily_usd': spendCap('AI spend cap per day, every tier (USD)'),
    ...Object.fromEntries(
      GENERATION_TIERS.map((tier) => [
        `ai.cap.${tier}.daily_usd`,
        spendCap(`AI spend cap per day on the ${tier} tier (USD)`),
      ]),
    ),
    'spend.month_budget_usd': spendCap('Monthly AI spend budget (USD)'),
    'moderation.sla_hours': {
      schema: z.number().int().min(1).max(720),
      isPublic: false,
      critical: false,
      description: 'Hours from the first filing until a report is due',
      group: 'services',
      note: 'Default 24',
    },
    'feedback.reply_hours': {
      schema: z.number().int().min(1).max(720),
      isPublic: false,
      critical: false,
      description: 'Hours until a feedback ticket is due a reply',
      group: 'services',
      note: 'Default 48',
    },
    'desk.hours': {
      schema: z.object({ open: clock, close: clock }).strict(),
      isPublic: false,
      critical: false,
      description: 'Concierge desk staffed hours (Asia/Singapore)',
      group: 'services',
    },
    'ops.on_call': {
      schema: z.string().trim().min(1).max(200),
      isPublic: false,
      critical: false,
      description: 'Who is on call for ops alerts',
      group: 'services',
    },
  };
}

function supplierKeys(partner: PartnerKey): Record<string, ConfigKeyDefinition> {
  return {
    [`supplier.${partner}.enabled`]: {
      schema: z.boolean(),
      isPublic: true,
      critical: true,
      description: `Whether the ${partner} adapter is live`,
      group: 'suppliers',
      managedBy: 'partners',
    },
    [`supplier.${partner}.copy_mode`]: {
      schema: partnerCopyModeSchema,
      isPublic: true,
      critical: true,
      description: `App copy for ${partner}: link or in-app booking`,
      group: 'suppliers',
      managedBy: 'partners',
    },
  };
}

export const CONFIG_KEYS: Readonly<Record<string, ConfigKeyDefinition>> = {
  'guide.free_daily_limit': {
    group: 'limits',
    schema: limit(1000),
    isPublic: true,
    critical: true,
    description: 'Free guide turns per user per day',
  },
  'seat.cap_free': {
    group: 'limits',
    schema: limit(100),
    isPublic: true,
    critical: true,
    description: 'Crew seats without a boost',
  },
  'seat.cap_boost': {
    group: 'limits',
    schema: limit(100),
    isPublic: true,
    critical: true,
    description: 'Crew seats with a boost',
  },
  'redraft.limit_free': {
    group: 'limits',
    schema: limit(100),
    isPublic: true,
    critical: false,
    description: 'Free redrafts per trip',
  },
  'billing.grace_days': {
    group: 'billing',
    schema: limit(60),
    isPublic: false,
    critical: true,
    description: 'Days a lapsed subscription keeps its perks',
  },
  'fair_use.guide_turns_per_user_day': {
    group: 'fair_use',
    schema: limit(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: guide turns per user per day',
  },
  'fair_use.crew_chat_per_crew_day': {
    group: 'fair_use',
    schema: limit(100_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: crew chat guide replies per crew per day',
  },
  'fair_use.redrafts_per_trip_day': {
    group: 'fair_use',
    schema: limit(10_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: redrafts per trip per day',
  },
  'fair_use.system_jobs_per_trip_day': {
    group: 'fair_use',
    schema: limit(10_000),
    isPublic: false,
    critical: false,
    description: 'Silent fair-use cap: system jobs per trip per day',
  },
  'perks.catalogue_version': {
    group: 'billing',
    schema: z.string().min(1).max(64),
    isPublic: true,
    critical: false,
    description: 'Which server-driven perk list the app shows',
  },
  [AVATAR_HASH_MATCH_CONFIG_KEY]: {
    group: 'suppliers',
    schema: z.boolean(),
    isPublic: false,
    critical: true,
    description:
      'Known-image hash matching runs on photo avatars (on once the vendor enrolment is live); off = every photo waits for ops review',
  },
  [APP_CLIP_FLAG_KEY]: {
    group: 'limits',
    schema: z.boolean(),
    isPublic: true,
    critical: false,
    description: 'Offer the iOS App Clip on invite pages (AASA appclips entry and banner card)',
  },
  ...Object.fromEntries(PARTNER_KEYS.flatMap((partner) => Object.entries(supplierKeys(partner)))),
  ...serviceKeys(),
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
  group: z.enum(CONFIG_KEY_GROUPS),
  /** Roles that may change the key; null = the command's own roles. */
  roles: z.array(adminRoleSchema).nullable(),
  note: z.string().nullable(),
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
