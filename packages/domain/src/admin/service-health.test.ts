import { describe, expect, it } from 'vitest';

import {
  judgeCalls,
  meterVendorCalls,
  serviceForOrigin,
  statuspageState,
  worstState,
} from './service-health';

const minute = (calls: number, errors: number, ms = 200) => ({
  calls,
  errors,
  latencies: Array.from({ length: calls }, () => ms),
});

describe('judgeCalls', () => {
  it('has no judgement without calls', () => {
    expect(judgeCalls([minute(0, 0)], 200)).toBeNull();
  });

  it('is ok at or under a 2 % error share and degraded above it', () => {
    expect(judgeCalls([minute(100, 2)], null)?.state).toBe('ok');
    expect(judgeCalls([minute(100, 3)], null)?.state).toBe('degraded');
  });

  it('is degraded when the p95 is over twice the baseline', () => {
    expect(judgeCalls([minute(10, 0, 401)], 200)?.state).toBe('degraded');
    expect(judgeCalls([minute(10, 0, 400)], 200)?.state).toBe('ok');
  });

  it('is down when most of several calls fail, not on one failed call', () => {
    expect(judgeCalls([minute(4, 2)], null)?.state).toBe('down');
    expect(judgeCalls([minute(1, 1)], null)?.state).toBe('degraded');
  });
});

describe('worstState', () => {
  it('takes the worst known state and is unknown only when nothing is known', () => {
    expect(worstState(['ok', 'unknown', 'degraded'])).toBe('degraded');
    expect(worstState(['ok', 'down', 'degraded'])).toBe('down');
    expect(worstState(['ok', 'unknown'])).toBe('ok');
    expect(worstState(['unknown'])).toBe('unknown');
  });
});

describe('statuspageState', () => {
  it('maps indicators and treats anything else as unknown', () => {
    expect(statuspageState('none')).toBe('ok');
    expect(statuspageState('major')).toBe('degraded');
    expect(statuspageState('critical')).toBe('down');
    expect(statuspageState(undefined)).toBe('unknown');
  });
});

describe('meterVendorCalls', () => {
  function setup() {
    const listeners = new Map<string, (message: unknown) => void>();
    const seen: { service: string; ok: boolean }[] = [];
    meterVendorCalls(
      (name, listener) => listeners.set(name, listener),
      (service, _ms, ok) => seen.push({ service, ok }),
    );
    const emit = (name: string, message: unknown) => listeners.get(name)?.(message);
    return { emit, seen };
  }

  it('counts a listed vendor call once, with 5xx and 429 as vendor errors', () => {
    const { emit, seen } = setup();
    for (const statusCode of [200, 404, 429, 503]) {
      const request = { origin: 'https://api.deepseek.com' };
      emit('undici:request:create', { request });
      emit('undici:request:headers', { request, response: { statusCode } });
    }
    expect(seen.map((call) => call.ok)).toEqual([true, true, false, false]);
    expect(seen.every((call) => call.service === 'deepseek')).toBe(true);
  });

  it('counts a network failure as an error and ignores unlisted hosts', () => {
    const { emit, seen } = setup();
    const ours = { origin: 'http://api.railway.internal:8787' };
    emit('undici:request:create', { request: ours });
    emit('undici:request:headers', { request: ours, response: { statusCode: 500 } });
    const vendor = { origin: 'https://api.tavily.com' };
    emit('undici:request:create', { request: vendor });
    emit('undici:request:error', { request: vendor, error: new Error('socket hang up') });
    expect(seen).toEqual([{ service: 'tavily', ok: false }]);
    expect(serviceForOrigin('not a url')).toBeNull();
  });
});
