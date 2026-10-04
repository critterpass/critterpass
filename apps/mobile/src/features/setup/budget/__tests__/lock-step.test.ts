/**
 * The knob's step outside dollars: the server's word wins; a currency with a step of its own (half
 * a million đồng) needs no rate; any other currency takes the round amount nearest $50 from synced
 * rates when the device holds a dollar rate, and without one it never falls back to a dollar-sized
 * step in another currency.
 */
import { describe, expect, it } from '@jest/globals';

import { gridFromBandRead, offStepOf, stepOf } from '../lock-step';
import { estimatesOf, trackOf } from '../model';

// One euro buys 1.25 dollars, so $50 is €40: ₩59,200 at 1,480 won to the euro, a ₩50,000 step.
const rate = (quote: string, value: string) => ({
  id: `fx-${quote}`,
  base: 'EUR',
  quote,
  rate: value,
  as_of: '2027-03-01',
  source: 'frankfurter',
});
const KRW = rate('KRW', '1480');
const USD = rate('USD', '1.25');

function crewIn(currency: string, fx: readonly ReturnType<typeof rate>[]) {
  return estimatesOf({
    currency,
    start_date: '2027-04-02',
    end_date: '2027-04-04',
    members: [{ uid: 'a', home: 'SGN' }],
    fares: [],
    indices: [],
    fx: [...fx],
  });
}
const wonCrew = (fx: readonly ReturnType<typeof rate>[]) => crewIn('KRW', fx);

const unknown = { adopted: null, server: null, currency: 'KRW', bandAnswered: false };

describe('the step in a crew settling in dong', () => {
  it('is half a million dong, with or without rates on the device', () => {
    const dong = { ...unknown, currency: 'VND' };
    expect(stepOf({ ...dong, estimates: crewIn('VND', []) })).toBe(500_000);
    expect(stepOf({ ...dong, estimates: crewIn('VND', [rate('VND', '32500'), USD]) })).toBe(
      500_000,
    );
  });
});

describe('the step in a crew settling in won', () => {
  it('is the server’s, over anything the device could work out', () => {
    const estimates = wonCrew([KRW, USD]);
    expect(stepOf({ ...unknown, server: 100_000, estimates })).toBe(100_000);
    expect(stepOf({ ...unknown, server: 100_000, adopted: 20_000, estimates })).toBe(20_000);
  });

  it('is the round amount nearest $50 once the dollar rate is on the device', () => {
    expect(stepOf({ ...unknown, estimates: wonCrew([KRW, USD]) })).toBe(50_000);
  });

  it('is not known, rather than dollar-sized, with no dollar rate and no answer yet', () => {
    expect(stepOf({ ...unknown, estimates: wonCrew([KRW]) })).toBeNull();
    expect(stepOf({ ...unknown, estimates: wonCrew([]) })).toBeNull();
    expect(stepOf({ ...unknown, estimates: null })).toBeNull();
  });

  it('stands in with a won-sized step once the read has answered without one', () => {
    const estimates = wonCrew([KRW]);
    const stepMinor = stepOf({ ...unknown, estimates, bandAnswered: true });
    // Fifty of the rates' base (€50 = ₩74,000), until the server says its own step.
    expect(stepMinor).toBe(74_000);
    const track = trackOf({ kind: 'waiting', set: 0, of: 2 }, estimates, stepMinor ?? 0);
    expect(track.maxMinor).toBeGreaterThan(2_000_000);
    expect(stepOf({ ...unknown, estimates: wonCrew([]), bandAnswered: true })).toBeNull();
  });

  it('stays $50 for a dollar crew with nothing synced', () => {
    expect(stepOf({ ...unknown, currency: 'USD', estimates: null })).toBe(5_000);
  });
});

describe('what the server says about the step', () => {
  it('reads it from the band and from "not enough maxes yet"', () => {
    expect(
      gridFromBandRead({ kind: 'ok', body: { currency: 'VND', step_minor: 1_300_000 } }),
    ).toEqual({ currency: 'VND', stepMinor: 1_300_000 });
    expect(
      gridFromBandRead({
        kind: 'error',
        status: 409,
        code: 'K_ANON_UNAVAILABLE',
        detail: { maxes_count: 0, member_count: 2, currency: 'SGD', step_minor: 6_400 },
      }),
    ).toEqual({ currency: 'SGD', stepMinor: 6_400 });
    expect(gridFromBandRead({ kind: 'error', status: 409, code: 'K_ANON_UNAVAILABLE' })).toBeNull();
    expect(gridFromBandRead({ kind: 'offline' })).toBeNull();
  });

  it('takes the step from a lock refused for sitting off it, and from nothing else', () => {
    const refused = (code: string, detail: unknown) =>
      ({ kind: 'rejected', opId: 'op', code, detail }) as const;
    expect(offStepOf(refused('VALIDATION', { reason: 'off_step', step_minor: 6_400 }))).toBe(6_400);
    expect(offStepOf(refused('VALIDATION', { reason: 'off_step' }))).toBeNull();
    expect(offStepOf(refused('VALIDATION', { issues: [] }))).toBeNull();
    expect(offStepOf(refused('STATE_INVALID', { reason: 'over_band' }))).toBeNull();
    expect(offStepOf({ kind: 'applied', opId: 'op', result: {} })).toBeNull();
  });
});
