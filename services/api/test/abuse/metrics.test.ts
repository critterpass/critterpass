import { describe, expect, it } from 'vitest';

import { createInMemoryOtpMetrics, createNoopOtpMetrics } from '../../src/abuse/metrics';

describe('createInMemoryOtpMetrics', () => {
  it('tallies otp_sent_total by country and channel', () => {
    const metrics = createInMemoryOtpMetrics();
    metrics.recordOtpSent('SG', 'whatsapp');
    metrics.recordOtpSent('SG', 'whatsapp');
    metrics.recordOtpSent('VN', 'prelude');
    const snapshot = metrics.snapshot();
    expect(snapshot.sentByCountryAndChannel.get('SG:whatsapp')).toBe(2);
    expect(snapshot.sentByCountryAndChannel.get('VN:prelude')).toBe(1);
  });

  it('computes otp_verify_ratio from recorded outcomes', () => {
    const metrics = createInMemoryOtpMetrics();
    metrics.recordOtpVerifyOutcome(true);
    metrics.recordOtpVerifyOutcome(true);
    metrics.recordOtpVerifyOutcome(false);
    expect(metrics.snapshot().verifyRatio).toBeCloseTo(2 / 3);
  });

  it('reports an undefined ratio before any verification outcome is recorded', () => {
    const metrics = createInMemoryOtpMetrics();
    expect(metrics.snapshot().verifyRatio).toBeUndefined();
  });
});

describe('createNoopOtpMetrics', () => {
  it('never throws for any call', () => {
    const metrics = createNoopOtpMetrics();
    expect(() => {
      metrics.recordOtpSent('SG', 'whatsapp');
      metrics.recordOtpVerifyOutcome(true);
    }).not.toThrow();
  });
});
