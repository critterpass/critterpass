/**
 * T4 done-when (phase-9): VN/SG/ID numbers route per table; blocked country -> VALIDATION with
 * `detail.reason: 'country_unsupported'`; WhatsApp sync send error falls back to SMS. Pure unit
 * coverage for services/api/src/auth/otp/{countries,router}.ts — no Postgres, no HTTP; the full
 * Better Auth flow ("uid unchanged after verify") is auth/otp.db.test.ts.
 */
import { DomainError } from '@cp/domain';
import { describe, expect, it, vi } from 'vitest';

import { countryOtpPolicy, isValidSendableNumber } from '../../src/auth/otp/countries';
import {
  createOtpRouter,
  type OtpChannelAdapter,
  type OtpDeliveryTracker,
} from '../../src/auth/otp/router';

describe('countryOtpPolicy', () => {
  it.each([
    ['+84901234567', 'VN', 'prelude'],
    ['+6591234567', 'SG', 'prelude'],
    ['+6281234567890', 'ID', 'prelude'],
    ['+14155552671', 'US', 'twilio_verify'],
    ['+447911123456', 'GB', 'twilio_verify'],
  ] as const)('routes %s (%s) to whatsapp + %s', (phone, _country, smsChannel) => {
    const policy = countryOtpPolicy(phone);
    expect(policy?.whatsappAllowed).toBe(true);
    expect(policy?.smsChannel).toBe(smsChannel);
  });

  it('returns undefined for an unparseable number', () => {
    expect(countryOtpPolicy('not-a-phone-number')).toBeUndefined();
  });
});

describe('isValidSendableNumber', () => {
  it('accepts a structurally valid E.164 number', () => {
    expect(isValidSendableNumber('+6591234567')).toBe(true);
  });

  it('rejects garbage input', () => {
    expect(isValidSendableNumber('not-a-phone-number')).toBe(false);
    expect(isValidSendableNumber('123')).toBe(false);
  });
});

function noopTracker(): OtpDeliveryTracker {
  return { recordDelivery: () => Promise.resolve() };
}

describe('createOtpRouter', () => {
  it('sends via whatsapp when registered and allowed', async () => {
    const whatsappSend = vi.fn<OtpChannelAdapter['send']>().mockResolvedValue({});
    const router = createOtpRouter({
      adapters: { whatsapp: { send: whatsappSend } },
      tracker: noopTracker(),
    });
    await router.sendOTP({
      phoneE164: '+6591234567',
      code: '123456',
      uid: undefined,
      verificationId: undefined,
    });
    expect(whatsappSend).toHaveBeenCalledWith({ phoneE164: '+6591234567', code: '123456' });
  });

  it('falls back to SMS when WhatsApp send throws synchronously', async () => {
    const whatsappSend = vi
      .fn<OtpChannelAdapter['send']>()
      .mockRejectedValue(new Error('not on whatsapp'));
    const smsSend = vi.fn<OtpChannelAdapter['send']>().mockResolvedValue({});
    const router = createOtpRouter({
      adapters: { whatsapp: { send: whatsappSend }, prelude: { send: smsSend } },
      tracker: noopTracker(),
    });
    await router.sendOTP({
      phoneE164: '+6591234567',
      code: '123456',
      uid: undefined,
      verificationId: undefined,
    });
    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(smsSend).toHaveBeenCalledWith({ phoneE164: '+6591234567', code: '123456' });
  });

  it('throws VALIDATION with country_unsupported for an unparseable number', async () => {
    const router = createOtpRouter({ adapters: {}, tracker: noopTracker() });
    await expect(
      router.sendOTP({
        phoneE164: 'garbage',
        code: '123456',
        uid: undefined,
        verificationId: undefined,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', detail: { reason: 'country_unsupported' } });
  });

  it('throws when no channel for the country has a registered adapter (missing credentials)', async () => {
    const router = createOtpRouter({ adapters: {}, tracker: noopTracker() });
    await expect(
      router.sendOTP({
        phoneE164: '+6591234567',
        code: '123456',
        uid: undefined,
        verificationId: undefined,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('records delivery with the provider message id, channel and uid when the adapter returns one', async () => {
    const recordDelivery = vi
      .fn<OtpDeliveryTracker['recordDelivery']>()
      .mockResolvedValue(undefined);
    const router = createOtpRouter({
      adapters: { whatsapp: { send: () => Promise.resolve({ providerMessageId: 'wamid.123' }) } },
      tracker: { recordDelivery },
    });
    await router.sendOTP({
      phoneE164: '+6591234567',
      code: '123456',
      uid: 'uid-1',
      verificationId: 'verification-1',
    });
    expect(recordDelivery).toHaveBeenCalledWith({
      providerMessageId: 'wamid.123',
      channel: 'whatsapp',
      uid: 'uid-1',
      verificationId: 'verification-1',
      phoneE164: '+6591234567',
    });
  });
});
