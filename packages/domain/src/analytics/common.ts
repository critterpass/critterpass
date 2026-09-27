/**
 * Shared vocabulary of the product analytics catalog (docs/code-standards.md §11 "Analytics"):
 * common properties every event may carry, and the enums and buckets event properties are built
 * from. A property is an id, an enum, a bucket, a count or a duration; never free text, names,
 * amounts, coordinates or any C3 column.
 */
import { z } from 'zod';

import { tripStatusSchema } from '../enums/trip';

export const ANALYTICS_SURFACES = ['app', 'widget', 'notification', 'la', 'web'] as const;
export const analyticsSurfaceSchema = z.enum(ANALYTICS_SURFACES);
export type AnalyticsSurface = z.infer<typeof analyticsSurfaceSchema>;

export const ANALYTICS_ENTITLEMENTS = ['free', 'pass', 'boost', 'ftf'] as const;
export const analyticsEntitlementSchema = z.enum(ANALYTICS_ENTITLEMENTS);
export type AnalyticsEntitlement = z.infer<typeof analyticsEntitlementSchema>;

export const ANALYTICS_PLATFORMS = ['ios', 'android', 'web', 'server'] as const;
export const analyticsPlatformSchema = z.enum(ANALYTICS_PLATFORMS);
export type AnalyticsPlatform = z.infer<typeof analyticsPlatformSchema>;

/** Where an action or record came from; each event narrows it with its own subset when needed. */
export const ANALYTICS_SOURCES = [
  'app',
  'widget',
  'notification',
  'la',
  'web',
  'link',
  'share',
  'deeplink',
  'alarm',
  'manual',
  'receipt',
  'email',
  'supplier',
  'booking',
  'guide',
  'import',
  'outbox',
  'system',
] as const;
export const analyticsSourceSchema = z.enum(ANALYTICS_SOURCES);
export type AnalyticsSource = z.infer<typeof analyticsSourceSchema>;

/** Pseudonymous person key: hex HMAC-SHA256 of the uid under the analytics salt (./pid.ts). */
export const userPidSchema = z.string().regex(/^[0-9a-f]{64}$/u, 'must be a hex HMAC-SHA256');

export const localeTagSchema = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/u);
export const appVersionTagSchema = z.string().regex(/^\d+\.\d+\.\d+([.+-][0-9A-Za-z.-]+)?$/u);

/** Non-negative integer count or duration (ms or s, named by the property). */
export const countSchema = z.number().int().nonnegative();
export const durationMsSchema = countSchema;

/** Coarse size buckets used instead of exact values where the exact value could identify. */
export const COUNT_BUCKETS = ['0', '1', '2-5', '6-10', '11-25', '26-50', '51+'] as const;
export const countBucketSchema = z.enum(COUNT_BUCKETS);
export const TOKEN_BUCKETS = ['lt_1k', '1k_4k', '4k_16k', '16k_64k', 'gte_64k'] as const;
export const tokenBucketSchema = z.enum(TOKEN_BUCKETS);
/** Budget band position only (never the amount): below, inside or above the crew's band. */
export const BAND_BUCKETS = ['below', 'low', 'mid', 'high', 'above'] as const;
export const bandBucketSchema = z.enum(BAND_BUCKETS);

export function countBucket(n: number): z.infer<typeof countBucketSchema> {
  if (n <= 0) return '0';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 10) return '6-10';
  if (n <= 25) return '11-25';
  if (n <= 50) return '26-50';
  return '51+';
}

export function tokenBucket(tokens: number): z.infer<typeof tokenBucketSchema> {
  if (tokens < 1_000) return 'lt_1k';
  if (tokens < 4_000) return '1k_4k';
  if (tokens < 16_000) return '4k_16k';
  if (tokens < 64_000) return '16k_64k';
  return 'gte_64k';
}

/** Properties any event may carry; the mobile provider and server helpers fill them. */
export const commonPropsSchema = z
  .object({
    user_pid: userPidSchema,
    crew_id: z.uuid(),
    trip_id: z.uuid(),
    trip_status: tripStatusSchema,
    platform: analyticsPlatformSchema,
    app_version: appVersionTagSchema,
    locale: localeTagSchema,
    entitlement: analyticsEntitlementSchema,
    guide_id: z.string().regex(/^[a-z0-9_-]{1,40}$/u),
    surface: analyticsSurfaceSchema,
    source: analyticsSourceSchema,
  })
  .partial();
export type CommonProps = z.infer<typeof commonPropsSchema>;
export const COMMON_PROP_KEYS = Object.keys(commonPropsSchema.shape) as (keyof CommonProps)[];
