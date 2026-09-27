/**
 * F-029 rate limits keyed by dimensions Better Auth's own rate limiter cannot express. Verified
 * against the installed `better-auth` 1.7.6 rate-limiter source
 * (`node_modules/better-auth/dist/api/rate-limiter/index.mjs`): every bucket key it computes is
 * `(ip, path)` — `rateLimit.customRules` can only change a matched path's `window`/`max`, never the
 * key itself — so "anonymous sign-in 10/h/IP" and "send-otp 10/h/IP" are Better Auth `customRules`
 * (services/api/src/auth/config.ts), while "send-otp 3/10 min/phone", "5/h/device" and
 * "link 10/h/uid" need this module's own Redis counters, applied via a `hooks.before` middleware
 * the same way services/api/src/abuse/attestation does.
 */
import { createHash } from 'node:crypto';

import { DomainError } from '@cp/domain';

export interface RateLimitRedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
}

export interface RateLimitRule {
  readonly windowSeconds: number;
  readonly max: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterS: number;
}

/** Not the peppered lookup hash T10's `packages/db/src/crypto` envelope will own for `user_private.phone_hash` — this one only keeps a phone number out of Redis key names/logs, nothing more. */
export function hashForRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Atomic increment-with-TTL-on-create (the same pattern services/api/src/auth/index.ts uses for
 * Better Auth's own `SecondaryStorage.increment`): one Redis round trip decides allow/deny, and a
 * second only runs to report an accurate `retry_after_s` once the limit is already exceeded.
 */
export async function checkRateLimit(
  redis: RateLimitRedisClient,
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, rule.windowSeconds);
  if (count <= rule.max) return { allowed: true, retryAfterS: 0 };
  const ttl = await redis.ttl(key);
  return { allowed: false, retryAfterS: ttl > 0 ? ttl : rule.windowSeconds };
}

function rateLimited(retryAfterS: number): DomainError {
  return new DomainError('RATE_LIMITED', { retry_after_s: retryAfterS });
}

export const OTP_SEND_PER_PHONE_RULE: RateLimitRule = { windowSeconds: 600, max: 3 };
export const OTP_SEND_PER_DEVICE_RULE: RateLimitRule = { windowSeconds: 3600, max: 5 };
export const LINK_PER_UID_RULE: RateLimitRule = { windowSeconds: 3600, max: 10 };

export interface AbuseRateLimitDeps {
  readonly redis: RateLimitRedisClient;
}

/**
 * Checks the phone-number and device dimensions for one `/phone-number/send-otp` request (the IP
 * dimension is Better Auth's own `customRules` entry for this same path, services/api/src/auth/
 * config.ts). A plain function of explicit inputs — not a `hooks.before` middleware itself — so
 * services/api/src/auth/hooks.ts can compose it with the attestation and pumping checks into one
 * combined `createAuthMiddleware` call; Better Auth's top-level `hooks.before` is a single function,
 * not an array of matcher rules the way a plugin's own `hooks` are. Missing an install id just skips
 * the device check — best-effort, same degrade-gracefully posture as attestation's log mode, not a
 * way for a client to opt out of the phone-number check.
 */
export async function enforceOtpSendRateLimit(
  input: { readonly phoneNumber: string | undefined; readonly installId: string | undefined },
  deps: AbuseRateLimitDeps,
): Promise<void> {
  if (!input.phoneNumber) return;

  const phoneDecision = await checkRateLimit(
    deps.redis,
    `abuse:otp-send:phone:${hashForRateLimitKey(input.phoneNumber)}`,
    OTP_SEND_PER_PHONE_RULE,
  );
  if (!phoneDecision.allowed) throw rateLimited(phoneDecision.retryAfterS);

  if (!input.installId) return;
  const deviceDecision = await checkRateLimit(
    deps.redis,
    `abuse:otp-send:device:${input.installId}`,
    OTP_SEND_PER_DEVICE_RULE,
  );
  if (!deviceDecision.allowed) throw rateLimited(deviceDecision.retryAfterS);
}

/**
 * Reusable "N per hour per uid" check for account-linking-shaped endpoints (`/link-social`, T6;
 * phone verify's own linking path). Not wired to a specific path here — the caller supplies the
 * already-authenticated uid, since only an endpoint that requires a session has one to key by.
 */
export async function checkLinkRateLimit(
  redis: RateLimitRedisClient,
  uid: string,
): Promise<RateLimitDecision> {
  return checkRateLimit(redis, `abuse:link:uid:${uid}`, LINK_PER_UID_RULE);
}
