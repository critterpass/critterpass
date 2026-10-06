/**
 * Channel order WhatsApp -> Telegram -> Prelude for every allow-listed country, each skipped when
 * absent or switched off; blocked country -> VALIDATION with `detail.reason: 'country_unsupported'`. Pure unit
 * coverage for services/api/src/auth/otp/{countries,router}.ts — no Postgres, no HTTP; the full
 * Better Auth flow ("uid unchanged after verify") is auth/otp.db.test.ts.
 */
import { DomainError } from '@cp/domain';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { describe, expect, it, vi } from 'vitest';

import {
  countryOtpPolicy,
  isValidSendableNumber,
  type OtpChannel,
} from '../../src/auth/otp/countries';
import {
  createOtpRouter,
  describeChannelFailure,
  type OtpChannelAdapter,
  type OtpChannelFailure,
  type OtpDeliveryTracker,
} from '../../src/auth/otp/router';
import { createMetricsRecorder } from '../../src/obs/metrics';

describe('countryOtpPolicy', () => {
  it.each([
    ['+84901234567', 'VN'],
    ['+6591234567', 'SG'],
    ['+6281234567890', 'ID'],
    ['+14155552671', 'US'],
    ['+447911123456', 'GB'],
  ] as const)('orders %s (%s) WhatsApp, Telegram, then Prelude SMS', (phone, _country) => {
    expect(countryOtpPolicy(phone)?.channels).toEqual(['whatsapp', 'telegram', 'prelude']);
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

/** No `ops.ops_config` rows: every channel's switch is on (a missing key is on). */
const allOn = { isOn: () => Promise.resolve(true) };

function noopTracker(): OtpDeliveryTracker {
  return { recordDelivery: () => Promise.resolve() };
}

describe('createOtpRouter', () => {
  it('sends via whatsapp when registered and allowed', async () => {
    const whatsappSend = vi.fn<OtpChannelAdapter['send']>().mockResolvedValue({});
    const router = createOtpRouter({
      adapters: { whatsapp: { send: whatsappSend } },
      tracker: noopTracker(),
      switches: allOn,
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
      switches: allOn,
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

  it('counts an SMS the provider accepted by destination country, and no chat-app send', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({ exporter, exportIntervalMillis: 60_000 });
    const meter = new MeterProvider({ readers: [reader] }).getMeter('test');
    const metrics = createMetricsRecorder({ meter, strict: true });
    const ok = () => vi.fn<OtpChannelAdapter['send']>().mockResolvedValue({});
    const failing = () =>
      vi.fn<OtpChannelAdapter['send']>().mockRejectedValue(new Error('provider down'));
    const send = (adapters: Partial<Record<OtpChannel, OtpChannelAdapter>>, phoneE164: string) =>
      createOtpRouter({ adapters, tracker: noopTracker(), switches: allOn, metrics }).sendOTP({
        phoneE164,
        code: '123456',
        uid: undefined,
        verificationId: undefined,
      });

    await send({ whatsapp: { send: ok() }, prelude: { send: ok() } }, '+6591234567');
    await send({ whatsapp: { send: failing() }, prelude: { send: ok() } }, '+6591234567');
    await send({ prelude: { send: ok() } }, '+6591234567');
    await send({ prelude: { send: ok() } }, '+84901234567');
    await expect(send({ prelude: { send: failing() } }, '+84901234567')).rejects.toThrow();

    await reader.forceFlush();
    const points = exporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics.flatMap((scope) => scope.metrics))
      .filter((metric) => metric.descriptor.name === 'cp_sms_sent_total')
      .flatMap((metric) =>
        metric.dataPoints.map((point) => ({ ...point.attributes, value: point.value })),
      );
    expect(points).toHaveLength(2);
    expect(points).toEqual(
      expect.arrayContaining([
        { provider: 'prelude', country: 'sg', value: 2 },
        { provider: 'prelude', country: 'vn', value: 1 },
      ]),
    );
  });

  it('throws VALIDATION with country_unsupported for an unparseable number', async () => {
    const router = createOtpRouter({ adapters: {}, tracker: noopTracker(), switches: allOn });
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
    const router = createOtpRouter({ adapters: {}, tracker: noopTracker(), switches: allOn });
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
      switches: allOn,
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

describe('createOtpRouter channel order', () => {
  type Behaviour = 'ok' | 'fail';
  const context = {
    phoneE164: '+6591234567',
    code: '123456',
    uid: undefined,
    verificationId: undefined,
  };

  function recordingAdapters(behaviours: Partial<Record<OtpChannel, Behaviour>>) {
    const calls: OtpChannel[] = [];
    const adapters: Partial<Record<OtpChannel, OtpChannelAdapter>> = {};
    for (const [channel, behaviour] of Object.entries(behaviours) as [OtpChannel, Behaviour][]) {
      adapters[channel] = {
        send: () => {
          calls.push(channel);
          return behaviour === 'ok'
            ? Promise.resolve({})
            : Promise.reject(new DomainError('SUPPLIER_UNAVAILABLE', { channel }));
        },
      };
    }
    return { adapters, calls };
  }

  it.each([
    [{ whatsapp: 'ok', telegram: 'ok', prelude: 'ok' }, ['whatsapp']],
    [{ telegram: 'ok', prelude: 'ok' }, ['telegram']],
    [{ whatsapp: 'ok', prelude: 'ok' }, ['whatsapp']],
    [{ prelude: 'ok' }, ['prelude']],
    [{ telegram: 'ok' }, ['telegram']],
    [{ whatsapp: 'fail', telegram: 'ok', prelude: 'ok' }, ['whatsapp', 'telegram']],
    [{ whatsapp: 'fail', telegram: 'fail', prelude: 'ok' }, ['whatsapp', 'telegram', 'prelude']],
    [{ whatsapp: 'fail', prelude: 'ok' }, ['whatsapp', 'prelude']],
  ] as const)('with %j tries %j', async (behaviours, expected) => {
    const { adapters, calls } = recordingAdapters(behaviours);
    const router = createOtpRouter({ adapters, tracker: noopTracker(), switches: allOn });
    await router.sendOTP(context);
    expect(calls).toEqual(expected);
  });

  it('skips a switched-off channel and moves to the next one', async () => {
    const { adapters, calls } = recordingAdapters({
      whatsapp: 'ok',
      telegram: 'ok',
      prelude: 'ok',
    });
    const off = new Set(['otp.whatsapp.enabled', 'otp.telegram.enabled']);
    const router = createOtpRouter({
      adapters,
      tracker: noopTracker(),
      switches: { isOn: (key) => Promise.resolve(!off.has(key)) },
    });
    await router.sendOTP(context);
    expect(calls).toEqual(['prelude']);
  });

  it('falls through a Telegram "cannot receive" error to SMS for a number outside Southeast Asia', async () => {
    const { adapters, calls } = recordingAdapters({ telegram: 'fail', prelude: 'ok' });
    const router = createOtpRouter({ adapters, tracker: noopTracker(), switches: allOn });
    await router.sendOTP({ ...context, phoneE164: '+14155552671' });
    expect(calls).toEqual(['telegram', 'prelude']);
  });

  it('surfaces the last channel error when every channel fails', async () => {
    const { adapters } = recordingAdapters({ whatsapp: 'fail', telegram: 'fail', prelude: 'fail' });
    const router = createOtpRouter({ adapters, tracker: noopTracker(), switches: allOn });
    await expect(router.sendOTP(context)).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { channel: 'prelude' },
    });
  });

  it('reports each failed channel with the provider reason before falling through', async () => {
    const failures: OtpChannelFailure[] = [];
    const router = createOtpRouter({
      adapters: {
        telegram: {
          send: () =>
            Promise.reject(
              new DomainError('SUPPLIER_UNAVAILABLE', {
                channel: 'telegram',
                status: 400,
                detail: 'PHONE_NUMBER_INVALID',
              }),
            ),
        },
        prelude: {
          send: () =>
            Promise.reject(
              new DomainError('SUPPLIER_UNAVAILABLE', {
                channel: 'prelude',
                status: 200,
                detail: 'blocked',
              }),
            ),
        },
      },
      tracker: noopTracker(),
      switches: allOn,
      onChannelFailure: (failure) => failures.push(failure),
    });
    await expect(router.sendOTP(context)).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE' });
    expect(failures).toEqual([
      {
        channel: 'telegram',
        code: 'SUPPLIER_UNAVAILABLE',
        status: 400,
        reason: 'PHONE_NUMBER_INVALID',
      },
      { channel: 'prelude', code: 'SUPPLIER_UNAVAILABLE', status: 200, reason: 'blocked' },
    ]);
  });

  it('masks phone numbers in a reported provider reason', () => {
    const error = new DomainError('SUPPLIER_UNAVAILABLE', {
      channel: 'prelude',
      status: 422,
      detail: '{"code":"invalid_phone_number","message":"+84 901 234 567 is not a valid number"}',
    });
    const failure = describeChannelFailure('prelude', error);
    expect(failure.reason).toBe(
      '{"code":"invalid_phone_number","message":"… is not a valid number"}',
    );
    expect(describeChannelFailure('whatsapp', new TypeError('fetch failed'))).toEqual({
      channel: 'whatsapp',
      code: 'TypeError',
      reason: 'fetch failed',
    });
  });

  it('records a Telegram request id against the telegram channel', async () => {
    const recordDelivery = vi.fn<OtpDeliveryTracker['recordDelivery']>().mockResolvedValue();
    const router = createOtpRouter({
      adapters: { telegram: { send: () => Promise.resolve({ providerMessageId: 'req-1' }) } },
      tracker: { recordDelivery },
      switches: allOn,
    });
    await router.sendOTP({ ...context, uid: 'uid-1' });
    expect(recordDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ providerMessageId: 'req-1', channel: 'telegram', uid: 'uid-1' }),
    );
  });
});
