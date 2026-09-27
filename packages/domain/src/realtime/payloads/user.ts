/**
 * `data` schemas for the owner-only `user:#<uid>` channel (docs/api-contracts-async.md §1.2), keyed
 * by envelope `type`. These are hints: ids, counts and states only — never a C3 value (docs/data-
 * model-sync-and-privacy.md §1). Types owned by later phases (`inbox.*`, `guide.private_message`)
 * add their own schema next to their feature.
 */
import { z } from 'zod';

import { ERROR_CODES } from '../../errors';

const isoDateTime = z.iso.datetime({ offset: true });

export const rtCmdResultSchema = z.strictObject({
  op_id: z.uuid(),
  status: z.enum(['applied', 'rejected', 'duplicate']),
  code: z.enum(ERROR_CODES).nullable(),
  result_ref: z.unknown().nullable(),
});

export const rtSessionRevokedSchema = z.strictObject({});

export const rtEntitlementChangedSchema = z.strictObject({
  subject_kind: z.enum(['user', 'trip']).optional(),
  subject_id: z.uuid().optional(),
});

export const rtUsageChangedSchema = z.strictObject({
  metric: z.string().min(1).max(64).optional(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative().nullable(),
  reset_at: isoDateTime.nullable(),
});

export const rtJobProgressSchema = z.strictObject({
  job_id: z.uuid(),
  step: z.string().min(1).max(64),
  pct: z.number().min(0).max(100),
});

export const rtBadgeCountsSchema = z.strictObject({
  counts: z.record(z.string().max(64), z.number().int().nonnegative()),
});

export const rtOtpChannelFailedSchema = z.strictObject({
  /** `null` when the failed delivery could not be matched to a verification attempt. */
  verification_id: z.string().min(1).max(128).nullable(),
});

export const RT_USER_PAYLOADS = {
  'cmd.result': rtCmdResultSchema,
  'session.revoked': rtSessionRevokedSchema,
  'entitlement.changed': rtEntitlementChangedSchema,
  'usage.changed': rtUsageChangedSchema,
  'job.progress': rtJobProgressSchema,
  'badge.counts': rtBadgeCountsSchema,
  'otp.channel_failed': rtOtpChannelFailedSchema,
} as const satisfies Readonly<Record<string, z.ZodType>>;

export type RtUserPayloadType = keyof typeof RT_USER_PAYLOADS;

/** The `data` schema for a `user:#<uid>` envelope type, or `undefined` for a type not listed here. */
export function rtUserPayloadSchema(type: string): z.ZodType | undefined {
  return Object.hasOwn(RT_USER_PAYLOADS, type)
    ? RT_USER_PAYLOADS[type as RtUserPayloadType]
    : undefined;
}
