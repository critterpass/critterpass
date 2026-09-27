/**
 * Support contracts (docs/api-contracts.md §4.17, §5.9): user lookup, the user detail the console
 * shows, the command trace, and the account and entitlement commands. Nothing here carries a C3
 * value: contact details are presence flags only, sessions carry no IP, devices no keys.
 */
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true });
const reason = z.string().trim().min(3).max(500);

/** Perks support can grant for a while (resolved as a Pass+ grant until `until`). */
export const GRANTABLE_PERKS = ['pass_plus'] as const;
export const grantablePerkSchema = z.enum(GRANTABLE_PERKS);
export type GrantablePerk = z.infer<typeof grantablePerkSchema>;

/** A support grant lasts at most this long; longer comps go through a promo code. */
export const GRANT_MAX_DAYS = 366;

export const SUPPORT_LOOKUP_KINDS = ['uid', 'email', 'phone', 'join_code', 'username'] as const;
export type SupportLookupKind = (typeof SUPPORT_LOOKUP_KINDS)[number];

export const supportLookupQuerySchema = z.object({ q: z.string().trim().min(1).max(200) });

export const supportUserSummarySchema = z.object({
  uid: z.uuid(),
  display_name: z.string().nullable(),
  username: z.string().nullable(),
  status: z.string(),
  member_since: isoDate.nullable(),
});
export type SupportUserSummary = z.infer<typeof supportUserSummarySchema>;

export const supportLookupResponseSchema = z.object({
  matched_by: z.enum(SUPPORT_LOOKUP_KINDS).nullable(),
  items: z.array(supportUserSummarySchema),
});
export type SupportLookupResponse = z.infer<typeof supportLookupResponseSchema>;

export const supportUserSchema = z.object({
  profile: supportUserSummarySchema.extend({
    home_country: z.string().nullable(),
    locale: z.string().nullable(),
    tz: z.string().nullable(),
    created_at: isoDate,
  }),
  account: z
    .object({
      is_anonymous: z.boolean(),
      has_email: z.boolean(),
      has_phone: z.boolean(),
      banned: z.boolean(),
      ban_reason: z.string().nullable(),
      ban_expires: isoDate.nullable(),
      created_at: isoDate,
    })
    .nullable(),
  sessions: z.array(
    z.object({
      id: z.string(),
      created_at: isoDate,
      expires_at: isoDate,
      user_agent: z.string().nullable(),
    }),
  ),
  devices: z.array(
    z.object({
      id: z.uuid(),
      platform: z.string(),
      app_version: z.string(),
      os_version: z.string().nullable(),
      last_seen_at: isoDate.nullable(),
    }),
  ),
  entitlements: z
    .object({
      pass_plus: z.boolean(),
      expires_at: isoDate.nullable(),
      guide_unlimited_global: z.boolean(),
      computed_at: isoDate,
    })
    .nullable(),
  grants: z.array(
    z.object({
      id: z.uuid(),
      perk: grantablePerkSchema,
      until: isoDate,
      reason: z.string(),
      granted_by: z.string(),
      granted_at: isoDate,
      revoked_at: isoDate.nullable(),
    }),
  ),
});
export type SupportUser = z.infer<typeof supportUserSchema>;

export const commandTraceQuerySchema = z
  .object({ op_id: z.uuid().optional(), uid: z.uuid().optional() })
  .refine((query) => query.op_id !== undefined || query.uid !== undefined, {
    message: 'op_id or uid',
  });

export const commandTraceItemSchema = z.object({
  op_id: z.uuid(),
  uid: z.uuid(),
  cmd: z.string(),
  status: z.string(),
  code: z.string().nullable(),
  detail: z.unknown(),
  result_ref: z.unknown(),
  server_ts: isoDate,
});
export const commandTraceResponseSchema = z.object({ items: z.array(commandTraceItemSchema) });
export type CommandTraceItem = z.infer<typeof commandTraceItemSchema>;

export const revokeSessionPayloadSchema = z.object({
  uid: z.uuid(),
  session_id: z.string().min(1).max(64),
  reason,
});

export const banUserPayloadSchema = z.object({
  uid: z.uuid(),
  reason,
  /** Null bans until an operator unbans. */
  until: isoDate.nullable(),
});

export const unbanUserPayloadSchema = z.object({ uid: z.uuid(), reason });

export const revokeDeviceKeyPayloadSchema = z.object({
  uid: z.uuid(),
  device_id: z.uuid(),
  reason,
});

export const grantEntitlementPayloadSchema = z.object({
  uid: z.uuid(),
  perk: grantablePerkSchema,
  until: isoDate,
  reason,
});
export type GrantEntitlementPayload = z.infer<typeof grantEntitlementPayloadSchema>;

export const revokeEntitlementPayloadSchema = z.object({
  uid: z.uuid(),
  perk: grantablePerkSchema,
  reason,
});
