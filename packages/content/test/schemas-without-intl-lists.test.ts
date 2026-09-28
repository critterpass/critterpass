import { afterEach, describe, expect, it, vi } from 'vitest';

// Hermes (the mobile runtime) has no `Intl.supportedValuesOf`; the schemas still load there.
describe('common schemas on a runtime without Intl.supportedValuesOf', () => {
  const original = Intl.supportedValuesOf;

  afterEach(() => {
    Object.defineProperty(Intl, 'supportedValuesOf', { value: original, configurable: true });
    vi.resetModules();
  });

  it('loads and still validates currencies and time zones', async () => {
    Object.defineProperty(Intl, 'supportedValuesOf', { value: undefined, configurable: true });
    vi.resetModules();
    const { currencyCodeSchema, timeZoneSchema } = await import('../src/schemas/common');

    expect(currencyCodeSchema.safeParse('IDR').success).toBe(true);
    expect(currencyCodeSchema.safeParse('idr').success).toBe(false);
    expect(timeZoneSchema.safeParse('Asia/Makassar').success).toBe(true);
    expect(timeZoneSchema.safeParse('Mars/Olympus').success).toBe(false);
  });
});
