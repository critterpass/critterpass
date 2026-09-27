/**
 * SMS-pumping defences (docs F-029): a configurable country allow-list distinct from
 * services/api/src/auth/otp/countries.ts's routing table (that one only decides *which* provider
 * handles an already-allowed country; this one decides whether to attempt sending at all), a
 * per-prefix velocity breaker (auto-disables a prefix after too many sends with zero successful
 * verifications), and a daily per-provider spend counter with a hard cap. Wired onto
 * `/phone-number/send-otp` via `hooks.before`/`hooks.after` the same way
 * services/api/src/abuse/rate-limits.ts and services/api/src/auth/hooks.ts's attestation gate are;
 * the spend-cap-triggers-WhatsApp-only behaviour is a reusable function
 * (`isProviderSpendCapExceeded`) rather than something forced into live adapter wiring here, since
 * no real provider credentials or cost-per-message figures are provisioned yet (phase-9 §Non-code
 * dependencies) to calibrate a real cap against.
 */
import { parsePhoneNumberWithError } from 'libphonenumber-js';

import { DomainError } from '@cp/domain';

export interface PumpingRedisClient {
  incr(key: string): Promise<number>;
  incrBy(key: string, amount: number): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
}

export interface VelocityBreakerConfig {
  readonly windowSeconds: number;
  readonly maxSendsWithoutVerify: number;
}

export interface PumpingConfig {
  /** ISO 3166-1 alpha-2 codes OTP is allowed to send to at all; server config (`otp.allowed_countries`), not the per-country provider choice in services/api/src/auth/otp/countries.ts. */
  readonly allowedCountries: readonly string[];
  readonly velocityBreaker: VelocityBreakerConfig;
  /** Micros of the smallest currency unit, per provider name (matching services/api/src/auth/otp/router.ts's `OtpChannel`), per UTC day. */
  readonly dailySpendCapMicros: Readonly<Record<string, number>>;
}

/**
 * A starter allow-list, not a business decision made here: Critterpass's SEA launch markets
 * (docs/product-decisions.md D14) plus common travel/English-speaking markets. Ops overrides this
 * via config as real usage and carrier relationships (D18 legal entity, Vietnam brandname
 * registration) come online — nothing about the velocity breaker or spend cap depends on this list's
 * exact contents.
 */
const DEFAULT_ALLOWED_COUNTRIES: readonly string[] = [
  'VN',
  'SG',
  'ID',
  'MY',
  'TH',
  'PH',
  'US',
  'GB',
  'AU',
  'CA',
  'JP',
  'KR',
];

export function defaultPumpingConfig(): PumpingConfig {
  return {
    allowedCountries: DEFAULT_ALLOWED_COUNTRIES,
    velocityBreaker: { windowSeconds: 900, maxSendsWithoutVerify: 10 },
    dailySpendCapMicros: {},
  };
}

function countryOf(phoneE164: string): string | undefined {
  try {
    return parsePhoneNumberWithError(phoneE164).country;
  } catch {
    return undefined;
  }
}

export function isCountryAllowed(phoneE164: string, config: PumpingConfig): boolean {
  const country = countryOf(phoneE164);
  return country !== undefined && config.allowedCountries.includes(country);
}

/** First 5 digits after the leading `+` (country code plus a short national prefix) — coarse enough to catch a burst hitting one range without over-blocking an entire country. */
function phonePrefix(phoneE164: string): string {
  return phoneE164.replace(/^\+/, '').slice(0, 5);
}

function sendsKey(prefix: string): string {
  return `abuse:otp-pumping:prefix:${prefix}:sends`;
}

function verifiesKey(prefix: string): string {
  return `abuse:otp-pumping:prefix:${prefix}:verifies`;
}

export async function recordOtpSendForPrefix(
  redis: PumpingRedisClient,
  phoneE164: string,
  config: VelocityBreakerConfig,
): Promise<void> {
  const key = sendsKey(phonePrefix(phoneE164));
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, config.windowSeconds);
}

export async function recordOtpVerifyForPrefix(
  redis: PumpingRedisClient,
  phoneE164: string,
  config: VelocityBreakerConfig,
): Promise<void> {
  const key = verifiesKey(phonePrefix(phoneE164));
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, config.windowSeconds);
}

/** True once a prefix has sent `maxSendsWithoutVerify` or more codes in the window with zero successful verifications — the auto-disable condition. */
export async function isPrefixVelocityBroken(
  redis: PumpingRedisClient,
  phoneE164: string,
  config: VelocityBreakerConfig,
): Promise<boolean> {
  const prefix = phonePrefix(phoneE164);
  const [sends, verifies] = await Promise.all([
    redis.get(sendsKey(prefix)),
    redis.get(verifiesKey(prefix)),
  ]);
  const sendCount = sends ? Number(sends) : 0;
  const verifyCount = verifies ? Number(verifies) : 0;
  return sendCount >= config.maxSendsWithoutVerify && verifyCount === 0;
}

const SECONDS_PER_DAY = 86_400;

function utcDateKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function spendKey(provider: string, now: Date): string {
  return `abuse:otp-pumping:spend:${provider}:${utcDateKey(now)}`;
}

/** Adds to today's (UTC) spend counter for a provider and returns the new running total. */
export async function recordProviderSpend(
  redis: PumpingRedisClient,
  provider: string,
  amountMicros: number,
  now: Date = new Date(),
): Promise<number> {
  const key = spendKey(provider, now);
  const total = await redis.incrBy(key, amountMicros);
  // Re-armed on every call rather than only at creation: simpler than computing exact seconds to
  // UTC midnight, and a day-scale TTL error either way only affects a counter that resets daily.
  await redis.expire(key, SECONDS_PER_DAY);
  return total;
}

/** Whether a provider's spend for today (UTC) has reached its configured cap — the router (or its caller) should stop offering that provider's channel once true, falling back to WhatsApp-only. */
export async function isProviderSpendCapExceeded(
  redis: PumpingRedisClient,
  provider: string,
  config: PumpingConfig,
  now: Date = new Date(),
): Promise<boolean> {
  const cap = config.dailySpendCapMicros[provider];
  if (cap === undefined) return false;
  const raw = await redis.get(spendKey(provider, now));
  const total = raw ? Number(raw) : 0;
  return total >= cap;
}

export interface PumpingHookDeps {
  readonly redis: PumpingRedisClient;
  readonly config: PumpingConfig;
}

/**
 * Rejects an unallowed country or an already-broken prefix before Better Auth generates and sends a
 * code at all. A plain function (see services/api/src/abuse/rate-limits.ts's
 * `enforceOtpSendRateLimit` for why): services/api/src/auth/hooks.ts composes this with the
 * attestation and rate-limit checks into the one `hooks.before` middleware Better Auth accepts.
 */
export async function enforceOtpSendPumpingDefences(
  phoneNumber: string | undefined,
  deps: PumpingHookDeps,
): Promise<void> {
  if (!phoneNumber) return;
  if (!isCountryAllowed(phoneNumber, deps.config)) {
    throw new DomainError('VALIDATION', { reason: 'country_unsupported' });
  }
  if (await isPrefixVelocityBroken(deps.redis, phoneNumber, deps.config.velocityBreaker)) {
    throw new DomainError('RATE_LIMITED', {
      retry_after_s: deps.config.velocityBreaker.windowSeconds,
      reason: 'prefix_velocity_breaker',
    });
  }
}

/** Records the send for velocity-breaker bookkeeping once Better Auth's own handler has run (only reached when `enforceOtpSendPumpingDefences` did not already reject the request). */
export async function recordOtpSendPumpingBookkeeping(
  phoneNumber: string | undefined,
  deps: PumpingHookDeps,
): Promise<void> {
  if (!phoneNumber) return;
  await recordOtpSendForPrefix(deps.redis, phoneNumber, deps.config.velocityBreaker);
}
