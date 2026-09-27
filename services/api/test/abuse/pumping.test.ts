/**
 * A synthetic pumping burst on one prefix trips the breaker. Pure unit coverage against a fake Redis.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultPumpingConfig,
  enforceOtpSendPumpingDefences,
  isCountryAllowed,
  isPrefixVelocityBroken,
  isProviderSpendCapExceeded,
  recordOtpSendForPrefix,
  recordOtpVerifyForPrefix,
  recordOtpSendPumpingBookkeeping,
  recordProviderSpend,
  type PumpingRedisClient,
} from '../../src/abuse/pumping';

class FakeRedis implements PumpingRedisClient {
  private readonly values = new Map<string, number>();
  private readonly expiresAt = new Map<string, number>();

  async incr(key: string): Promise<number> {
    return this.incrBy(key, 1);
  }

  async incrBy(key: string, amount: number): Promise<number> {
    const next = (this.values.get(key) ?? 0) + amount;
    this.values.set(key, next);
    await Promise.resolve();
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expiresAt.set(key, Date.now() + seconds * 1000);
    await Promise.resolve();
    return 1;
  }

  async get(key: string): Promise<string | null> {
    await Promise.resolve();
    const value = this.values.get(key);
    return value === undefined ? null : String(value);
  }
}

describe('isCountryAllowed', () => {
  it('allows a launch-market number', () => {
    expect(isCountryAllowed('+6598765432', defaultPumpingConfig())).toBe(true);
  });

  it('rejects a number outside the allow-list', () => {
    // +86 (China) is deliberately not in the starter allow-list.
    expect(isCountryAllowed('+8613800000000', defaultPumpingConfig())).toBe(false);
  });

  it('rejects an unparseable number', () => {
    expect(isCountryAllowed('garbage', defaultPumpingConfig())).toBe(false);
  });
});

describe('prefix velocity breaker', () => {
  const config = { windowSeconds: 900, maxSendsWithoutVerify: 3 };
  const phone = '+6598765432';

  it('is not broken before the threshold', async () => {
    const redis = new FakeRedis();
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpSendForPrefix(redis, phone, config);
    expect(await isPrefixVelocityBroken(redis, phone, config)).toBe(false);
  });

  it('trips once sends reach the threshold with zero verifications', async () => {
    const redis = new FakeRedis();
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpSendForPrefix(redis, phone, config);
    expect(await isPrefixVelocityBroken(redis, phone, config)).toBe(true);
  });

  it('does not trip when a verification has succeeded for the prefix', async () => {
    const redis = new FakeRedis();
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpSendForPrefix(redis, phone, config);
    await recordOtpVerifyForPrefix(redis, phone, config);
    expect(await isPrefixVelocityBroken(redis, phone, config)).toBe(false);
  });

  it('a different prefix is unaffected by another prefix tripping', async () => {
    const redis = new FakeRedis();
    for (let i = 0; i < 3; i += 1) await recordOtpSendForPrefix(redis, '+6598760000', config);
    expect(await isPrefixVelocityBroken(redis, '+8498765432', config)).toBe(false);
  });
});

describe('enforceOtpSendPumpingDefences', () => {
  it('throws VALIDATION/country_unsupported for a disallowed country', async () => {
    const redis = new FakeRedis();
    await expect(
      enforceOtpSendPumpingDefences('+8613800000000', { redis, config: defaultPumpingConfig() }),
    ).rejects.toMatchObject({ code: 'VALIDATION', detail: { reason: 'country_unsupported' } });
  });

  it('throws RATE_LIMITED once the velocity breaker trips for the prefix', async () => {
    const redis = new FakeRedis();
    const config = {
      ...defaultPumpingConfig(),
      velocityBreaker: { windowSeconds: 900, maxSendsWithoutVerify: 2 },
    };
    const deps = { redis, config };
    await recordOtpSendPumpingBookkeeping('+6598765432', deps);
    await recordOtpSendPumpingBookkeeping('+6598765432', deps);
    await expect(enforceOtpSendPumpingDefences('+6598765433', deps)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      detail: { reason: 'prefix_velocity_breaker' },
    });
  });

  it('does nothing when phoneNumber is undefined', async () => {
    const redis = new FakeRedis();
    await expect(
      enforceOtpSendPumpingDefences(undefined, { redis, config: defaultPumpingConfig() }),
    ).resolves.toBeUndefined();
  });
});

describe('provider daily spend cap', () => {
  it('is not exceeded below the cap and is exceeded at/after it', async () => {
    const redis = new FakeRedis();
    const config = { ...defaultPumpingConfig(), dailySpendCapMicros: { twilio_verify: 1000 } };
    await recordProviderSpend(redis, 'twilio_verify', 400);
    expect(await isProviderSpendCapExceeded(redis, 'twilio_verify', config)).toBe(false);
    await recordProviderSpend(redis, 'twilio_verify', 700);
    expect(await isProviderSpendCapExceeded(redis, 'twilio_verify', config)).toBe(true);
  });

  it('never trips for a provider with no configured cap', async () => {
    const redis = new FakeRedis();
    const config = defaultPumpingConfig();
    await recordProviderSpend(redis, 'prelude', 1_000_000);
    expect(await isProviderSpendCapExceeded(redis, 'prelude', config)).toBe(false);
  });
});
