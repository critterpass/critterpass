/**
 * The knob's step outside dollars: the server's word wins, the device derives the same $50 from
 * synced rates when it holds a dollar rate, and without one it never falls back to a dollar-sized
 * step in another currency.
 */
import { describe, expect, it } from '@jest/globals';

import { gridFromBandRead, offStepOf, stepOf } from '../lock-step';
import { estimatesOf, trackOf } from '../model';

// One euro buys 1.25 dollars, so $50 is €40: 1,300,000 ₫ at 32,500 ₫ to the euro.
const rate = (quote: string, value: string) => ({
  id: `fx-${quote}`,
  base: 'EUR',
  quote,
  rate: value,
  as_of: '2027-03-01',
  source: 'frankfurter',
});
const VND = rate('VND', '32500');
const USD = rate('USD', '1.25');

function dongCrew(fx: readonly ReturnType<typeof rate>[]) {
  return estimatesOf({
    currency: 'VND',
    start_date: '2027-04-02',
    end_date: '2027-04-04',
    members: [{ uid: 'a', home: 'SGN' }],
    fares: [],
    indices: [],
    fx: [...fx],
  });
}

const unknown = { adopted: null, server: null, currency: 'VND', bandAnswered: false };

describe('the step in a crew settling in dong', () => {
  it('is the server’s, over anything the device could work out', () => {
    const estimates = dongCrew([VND, USD]);
    expect(stepOf({ ...unknown, server: 1_400_000, estimates })).toBe(1_400_000);
    expect(stepOf({ ...unknown, server: 1_400_000, adopted: 1_200_000, estimates })).toBe(
      1_200_000,
    );
  });

  it('is $50 in dong once the dollar rate is on the device', () => {
    expect(stepOf({ ...unknown, estimates: dongCrew([VND, USD]) })).toBe(1_300_000);
  });

  it('is not known, rather than dollar-sized, with no dollar rate and no answer yet', () => {
    expect(stepOf({ ...unknown, estimates: dongCrew([VND]) })).toBeNull();
    expect(stepOf({ ...unknown, estimates: dongCrew([]) })).toBeNull();
    expect(stepOf({ ...unknown, estimates: null })).toBeNull();
  });

  it('stands in with a dong-sized step once the read has answered without one', () => {
    const estimates = dongCrew([VND]);
    const stepMinor = stepOf({ ...unknown, estimates, bandAnswered: true });
    // Fifty of the rates' base (€50 = 1,625,000 ₫), rounded up like the server's step.
    expect(stepMinor).toBe(1_700_000);
    const track = trackOf({ kind: 'waiting', set: 0, of: 2 }, estimates, stepMinor ?? 0);
    expect(track.maxMinor).toBeGreaterThan(50_000_000);
    expect(stepOf({ ...unknown, estimates: dongCrew([]), bandAnswered: true })).toBeNull();
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
