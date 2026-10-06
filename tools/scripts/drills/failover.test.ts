import { describe, expect, it } from 'vitest';

import { assertDrillTarget, summarise, type Sample } from './failover';

describe('assertDrillTarget', () => {
  it('refuses production and runs without --staging', () => {
    expect(() => assertDrillTarget('main', true)).toThrow(/refusing/u);
    expect(() => assertDrillTarget('staging', false)).toThrow(/--staging/u);
    expect(assertDrillTarget('staging', true)).toBe('staging');
  });
});

describe('summarise', () => {
  const start = 1_000_000;
  const at = (s: number, dbOk: boolean, apiOk: boolean, slots: Sample['slots']): Sample => ({
    at: start + s * 1000,
    dbOk,
    apiOk,
    slots,
  });

  it('measures the outage and sees the same slot come back', () => {
    const result = summarise(['ps_slot'], start, [
      at(5, false, false, []),
      at(10, false, true, []),
      at(15, true, true, [{ name: 'ps_slot', active: true }]),
    ]);
    expect(result).toEqual({
      dbDownSeconds: 10,
      apiDownSeconds: 5,
      slotBackSeconds: 15,
      slotSurvived: true,
      passed: true,
    });
  });

  it('flags a new slot (a full re-snapshot) and fails when no slot comes back', () => {
    const renewed = summarise(['ps_slot'], start, [
      at(5, true, true, [{ name: 'ps_new', active: true }]),
    ]);
    expect(renewed.slotSurvived).toBe(false);
    expect(renewed.passed).toBe(true);
    const lost = summarise(['ps_slot'], start, [at(5, true, true, [])]);
    expect(lost.passed).toBe(false);
  });
});
