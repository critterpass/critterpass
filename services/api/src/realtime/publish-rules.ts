/**
 * Client publish rules for the publish proxy (docs/api-contracts-async.md §1.1 "Client publish",
 * "Throttle"). Only namespaces with `clientPublish` accept anything, only the listed types in their
 * exact shape, within the byte limit and at most once per type window per user and channel. Every
 * other write is a command. Centrifugo OSS has no per-operation limits, so the window lives here.
 */
import {
  generateUuidV7,
  RT_ENVELOPE_VERSION,
  rtJsonByteLength,
  type RtClientPublish,
  type RtEnvelope,
} from '@cp/domain';

/** The one Redis call the rate window needs; node-redis clients satisfy it. */
export interface RtRateStore {
  set(key: string, value: string, options: { NX: true; PX: number }): Promise<string | null>;
}

export type RtPublishCheck =
  | {
      readonly ok: true;
      readonly type: string;
      readonly minIntervalMs: number;
      readonly data?: unknown;
    }
  | { readonly ok: false; readonly reason: 'not_allowed' | 'too_large' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Shape and size check; pure, so the proxy runs it before any Redis or database work. */
export function checkClientPublish(
  rules: RtClientPublish | undefined,
  published: unknown,
): RtPublishCheck {
  if (rules === undefined) return { ok: false, reason: 'not_allowed' };
  if (rtJsonByteLength(published) > rules.maxBytes) return { ok: false, reason: 'too_large' };
  if (!isRecord(published) || typeof published.type !== 'string') {
    return { ok: false, reason: 'not_allowed' };
  }
  const rule = Object.hasOwn(rules.types, published.type) ? rules.types[published.type] : undefined;
  if (rule === undefined) return { ok: false, reason: 'not_allowed' };
  const parsed = rule.schema.safeParse(published);
  if (!parsed.success) return { ok: false, reason: 'not_allowed' };
  return {
    ok: true,
    type: parsed.data.type,
    minIntervalMs: rule.minIntervalMs,
    ...(parsed.data.data !== undefined ? { data: parsed.data.data } : {}),
  };
}

/**
 * Claims this user's slot for `type` on `channel`; `false` means an earlier publication is still
 * inside its window and this one must be dropped. `SET NX PX` makes the claim atomic across api
 * instances.
 */
export async function takePublishSlot(
  store: RtRateStore,
  input: {
    readonly uid: string;
    readonly channel: string;
    readonly type: string;
    readonly minIntervalMs: number;
  },
): Promise<boolean> {
  const key = `rt:pub:${input.channel}:${input.type}:${input.uid}`;
  const claimed = await store.set(key, '1', { NX: true, PX: input.minIntervalMs });
  return claimed !== null;
}

/**
 * The envelope Centrifugo publishes instead of the client's raw data: a server-assigned id and
 * time, and the publisher's uid taken from the verified connection, never from the client.
 */
export function buildClientPublication(
  uid: string,
  check: Extract<RtPublishCheck, { ok: true }>,
  now: Date = new Date(),
): RtEnvelope {
  const extra = isRecord(check.data) ? check.data : {};
  return {
    v: RT_ENVELOPE_VERSION,
    id: generateUuidV7(),
    type: check.type,
    at: now.toISOString(),
    data: { ...extra, uid },
  };
}
