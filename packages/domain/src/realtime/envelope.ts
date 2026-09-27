/**
 * The realtime payload envelope every Centrifugo publication carries (docs/api-contracts-async.md
 * §1.1 "Payload envelope"): `{v: 1, id, type, at, data}`, at most 8 KB serialised. Clients dedupe
 * on `id`; `type` is `<aggregate>.<event>` (or a bare word such as `typing` for client presence).
 */
import { z } from 'zod';

export const RT_ENVELOPE_VERSION = 1;

/** Upper bound on one serialised envelope, in UTF-8 bytes. */
export const RT_ENVELOPE_MAX_BYTES = 8 * 1024;

export const rtEventTypeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, { message: 'must be a dotted snake_case type' })
  .max(64);

export const rtEnvelopeSchema = z.strictObject({
  v: z.literal(RT_ENVELOPE_VERSION),
  id: z.uuid(),
  type: rtEventTypeSchema,
  at: z.iso.datetime({ offset: true }),
  data: z.unknown(),
});

export type RtEnvelope = z.infer<typeof rtEnvelopeSchema>;

/** UTF-8 byte length of a value's JSON encoding (what Centrifugo actually carries). */
export function rtJsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export type RtEnvelopeCheck =
  | { readonly ok: true; readonly envelope: RtEnvelope }
  | { readonly ok: false; readonly reason: 'invalid' | 'too_large' };

/** Validates shape and size; never throws, so a relay can decide what to do with a bad row. */
export function checkRtEnvelope(value: unknown): RtEnvelopeCheck {
  const parsed = rtEnvelopeSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  if (rtJsonByteLength(parsed.data) > RT_ENVELOPE_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true, envelope: parsed.data };
}

export interface RtEnvelopeDefaults {
  /** Used when the payload carries no envelope `id` (the outbox row's own idempotency key). */
  readonly id: string;
  /** Used when the payload carries no envelope `at` (the outbox row's creation time). */
  readonly at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Normalises an outbox payload into the wire envelope. Full envelopes pass through; the two
 * shorthand shapes SQL functions and early handlers write — `{type, data}` and a flat
 * `{type, ...fields}` — are wrapped with the row's own id and timestamp, so every publication a
 * client sees has an `id` to dedupe on.
 */
export function toRtEnvelope(payload: unknown, defaults: RtEnvelopeDefaults): RtEnvelopeCheck {
  if (!isRecord(payload)) return { ok: false, reason: 'invalid' };
  if ('v' in payload) return checkRtEnvelope(payload);
  const { type, ...rest } = payload;
  const keys = Object.keys(rest);
  const data = keys.length === 1 && keys[0] === 'data' ? rest.data : rest;
  return checkRtEnvelope({ v: RT_ENVELOPE_VERSION, id: defaults.id, type, at: defaults.at, data });
}
