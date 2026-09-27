/**
 * The command envelope every write carries, whichever door it enters — `/v1/cmd/*`, `/sync/upload`,
 * `/v1/actions` or the worker's `dispatchSystem()` (docs/api-contracts.md §2.1, §2.2).
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';

function looksLikeIanaTimeZoneName(value: string): boolean {
  return value === 'UTC' || /^[A-Za-z_+-]+\/[A-Za-z0-9_+\-/]+$/.test(value);
}

/**
 * Accepts canonical IANA names and backward-compatibility links alike (e.g. both
 * `Asia/Ho_Chi_Minh` and its older alias `Asia/Saigon`), matching Postgres's `pg_timezone_names`
 * more closely than `Intl.supportedValuesOf('timeZone')`, which omits some links ICU treats as
 * non-canonical. This is a client-input sanity check; `app.valid_tz` is the source of truth.
 */
export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !looksLikeIanaTimeZoneName(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const ianaTimeZoneSchema = z
  .string()
  .refine(isIanaTimeZone, { message: 'must be an IANA time zone' });

export const ACTOR_VIA_VALUES = [
  'app',
  'offline',
  'widget',
  'notif_action',
  'la_intent',
  'app_intent',
  'system',
  'admin',
] as const;
export const actorViaSchema = z.enum(ACTOR_VIA_VALUES);
export type ActorVia = z.infer<typeof actorViaSchema>;

export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;
export const devicePlatformSchema = z.enum(DEVICE_PLATFORMS);
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;

/** snake_case verb_noun (docs/code-standards.md §3), e.g. `cast_ballot`. */
export const commandNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/, 'must be a snake_case verb_noun');
export type CommandName = z.infer<typeof commandNameSchema>;

export const commandActorSchema = z.object({
  /** Overwritten and asserted against the authenticated session/action-key uid by the server. */
  uid: z.uuid(),
  via: actorViaSchema,
});
export type CommandActor = z.infer<typeof commandActorSchema>;

export const commandDeviceSchema = z.object({
  id: z.string().min(1),
  platform: devicePlatformSchema,
  app_version: z.string().min(1),
  tz: ianaTimeZoneSchema,
});
export type CommandDevice = z.infer<typeof commandDeviceSchema>;

/** One envelope shape per command, parameterised by that command's payload schema. */
export function commandEnvelopeSchema<Payload extends z.ZodType>(payloadSchema: Payload) {
  return z.object({
    /** Client UUIDv7; the idempotency key (`cmd_log.op_id`). */
    op_id: uuidV7Schema,
    cmd: commandNameSchema,
    v: z.literal(1),
    actor: commandActorSchema,
    device: commandDeviceSchema,
    /** Device clock; the server stores skew but never trusts this for ordering. */
    client_ts: z.iso.datetime({ offset: true }),
    /** Optimistic concurrency where the aggregate is versioned. */
    base_version: z.number().int().positive().optional(),
    payload: payloadSchema,
  });
}

export type CommandEnvelope<Payload> = z.infer<
  ReturnType<typeof commandEnvelopeSchema<z.ZodType<Payload>>>
>;
