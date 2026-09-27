/**
 * Wire shapes of the link endpoints (docs/api-contracts.md §5.6), shared by the api that serves
 * them, the web handoff pages and the app that read them.
 */
import { z } from 'zod';

import { LINK_KINDS } from './grammar';

/** Where a link's target stands; consumer screens own the copy for each state. */
export const LINK_STATES = ['active', 'expired', 'revoked', 'full'] as const;
export const linkStateSchema = z.enum(LINK_STATES);
export type LinkState = z.infer<typeof linkStateSchema>;

export const linkKindSchema = z.enum(LINK_KINDS);

/** Public-safe preview: never more than a stranger holding the link may see. */
export const linkPreviewSchema = z.object({
  kind: linkKindSchema,
  crew_name: z.string().nullable(),
  inviter_first_name: z.string().nullable(),
  trip_place: z.string().nullable(),
  members_count: z.number().int().nonnegative().nullable(),
  expires_at: z.string().nullable(),
  state: linkStateSchema,
});
export type LinkPreview = z.infer<typeof linkPreviewSchema>;

/** `GET /v1/codes/{code}`: a live code's preview plus the canonical code and link path. */
export const codeLookupResponseSchema = linkPreviewSchema.extend({
  code: z.string(),
  link: z.string(),
});
export type CodeLookupResponse = z.infer<typeof codeLookupResponseSchema>;

/** How an install found its link (`install_attributions.via`). */
export const ATTRIBUTION_VIAS = ['referrer', 'paste', 'code', 'phone', 'clip', 'link'] as const;
export const attributionViaSchema = z.enum(ATTRIBUTION_VIAS);
export type AttributionVia = z.infer<typeof attributionViaSchema>;

const CLAIM_SOURCES = [
  'install_referrer',
  'pasted_url',
  'join_code',
  'phone',
  'opened_url',
  'clip_url',
] as const;

/**
 * `claim_attribution` payload: exactly one source. `phone: true` asks the server to match the
 * caller's verified phone against pending seat invites; the number itself never travels here.
 */
export const claimAttributionPayloadSchema = z
  .object({
    install_referrer: z.string().min(1).max(1024).optional(),
    pasted_url: z.string().min(1).max(2048).optional(),
    join_code: z.string().min(1).max(16).optional(),
    phone: z.literal(true).optional(),
    opened_url: z.string().min(1).max(2048).optional(),
    /** iOS: the link the App Clip was invoked with, handed over through the App Group. */
    clip_url: z.string().min(1).max(2048).optional(),
  })
  .strict()
  .refine((payload) => CLAIM_SOURCES.filter((key) => payload[key] !== undefined).length === 1, {
    message: 'exactly one claim source is required',
  });
export type ClaimAttributionPayload = z.infer<typeof claimAttributionPayloadSchema>;

export const claimAttributionResultSchema = z.object({
  /** False when the phone route found no pending invite; every other claim matches or rejects. */
  matched: z.boolean(),
  via: attributionViaSchema,
  kind: linkKindSchema.nullable(),
  state: linkStateSchema.nullable(),
  /** Canonical link path (`/i/K7M2QX`), the app router's input. */
  link: z.string().nullable(),
  crew_id: z.uuid().nullable(),
  /** True when this device had already claimed; the first claim's link is returned. */
  replayed: z.boolean(),
});
export type ClaimAttributionResult = z.infer<typeof claimAttributionResultSchema>;

/**
 * Server flag (`ops_config`, public): whether invite pages offer the App Clip — the AASA
 * `appclips` entry and the clip card in the Smart App Banner. Off unless set.
 */
export const APP_CLIP_FLAG_KEY = 'links.app_clip';

/** `GET /v1/links/settings`: the link switches the web Worker needs, read per host. */
export const linkSettingsSchema = z.object({ app_clip: z.boolean() });
export type LinkSettings = z.infer<typeof linkSettingsSchema>;
