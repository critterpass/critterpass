/**
 * The hub's phase and countdown: planning has no countdown; before the trip it counts to my first
 * departure (or the first day at 00:00 in the trip's zone); a flight today makes it a travel day
 * until I land; then "day n of m"; then home. And the MONEY tile's net in the trip's currency.
 */
import { describe, expect, it } from '@jest/globals';

import {
  countdownClock,
  hubHeader,
  offersSwipe,
  offlineCardPhase,
  viewerNet,
  type HubTripInput,
} from '../hub-model';

const TRIP: HubTripInput = {
  status: 'pre_trip',
  startDate: '2026-10-12',
  endDate: '2026-10-19',
  tz: 'Asia/Makassar',
  countdownTargetAt: null,
  landedAt: null,
};
const FLIGHT = {
  id: 'f1',
  title: 'SQ 938',
  departsAt: new Date('2026-10-11T23:00:00Z'),
  arrivesAt: new Date('2026-10-12T04:00:00Z'),
};

describe('hub phase', () => {
  it('has no countdown while the trip is planned', () => {
    expect(hubHeader({ ...TRIP, status: 'voting' }, [], new Date('2026-09-01T00:00:00Z'))).toEqual({
      phase: 'planning',
    });
  });

  it('counts nothing for a called-off trip, whatever its dates say', () => {
    const cancelled = { ...TRIP, status: 'cancelled' };
    for (const at of ['2026-09-25T10:00:00Z', '2026-10-14T10:00:00Z', '2026-11-01T10:00:00Z']) {
      expect(hubHeader(cancelled, [FLIGHT], new Date(at))).toEqual({ phase: 'cancelled' });
    }
  });

  it('gives the hub to the offline card only on a travel day, during the trip and on its eve', () => {
    const at = (iso: string, status = 'pre_trip') => {
      const now = new Date(iso);
      return offlineCardPhase(hubHeader({ ...TRIP, status }, [], now), now);
    };
    expect(at('2026-09-25T10:00:00Z', 'voting')).toBe(false);
    expect(at('2026-09-25T10:00:00Z')).toBe(false);
    expect(at('2026-10-11T02:00:00Z')).toBe(true);
    expect(at('2026-10-14T10:00:00Z')).toBe(true);
    expect(at('2026-11-01T10:00:00Z')).toBe(false);
    expect(at('2026-10-14T10:00:00Z', 'cancelled')).toBe(false);
    const flying = new Date('2026-10-11T20:00:00Z');
    expect(offlineCardPhase(hubHeader(TRIP, [FLIGHT], flying), flying)).toBe(true);
  });

  it('offers the place swipe once the place is picked and until the trip starts', () => {
    const at = (iso: string, status: string) =>
      offersSwipe(hubHeader({ ...TRIP, status }, [], new Date(iso)), status);
    expect(at('2026-09-01T00:00:00Z', 'voting')).toBe(false);
    expect(at('2026-09-01T00:00:00Z', 'drafting')).toBe(true);
    expect(at('2026-09-25T10:00:00Z', 'pre_trip')).toBe(true);
    expect(at('2026-10-14T10:00:00Z', 'in_trip')).toBe(false);
    expect(at('2026-11-01T10:00:00Z', 'post_trip')).toBe(false);
    expect(at('2026-09-25T10:00:00Z', 'cancelled')).toBe(false);
  });

  it("counts to the trip's first day in its own zone, or to my departure", () => {
    const now = new Date('2026-09-25T10:00:00Z');
    expect(hubHeader(TRIP, [], now)).toEqual({
      phase: 'pre',
      byAir: false,
      target: new Date('2026-10-11T16:00:00Z'),
    });
    const mine = { ...TRIP, countdownTargetAt: '2026-10-11T23:00:00Z' };
    expect(hubHeader(mine, [FLIGHT], now)).toEqual({
      phase: 'pre',
      target: FLIGHT.departsAt,
      byAir: true,
    });
  });

  it('is a travel day from my flight until I land, then day 1', () => {
    const boarding = new Date('2026-10-11T20:00:00Z');
    expect(hubHeader(TRIP, [FLIGHT], boarding)).toMatchObject({
      phase: 'travel',
      target: FLIGHT.departsAt,
    });
    const flying = new Date('2026-10-12T01:00:00Z');
    expect(hubHeader(TRIP, [FLIGHT], flying)).toMatchObject({
      phase: 'travel',
      target: FLIGHT.arrivesAt,
    });
    const landed = { ...TRIP, status: 'in_trip', landedAt: '2026-10-12T04:10:00Z' };
    expect(hubHeader(landed, [FLIGHT], new Date('2026-10-12T05:00:00Z'))).toEqual({
      phase: 'in',
      day: 1,
      days: 8,
    });
  });

  it('counts days during the trip and says home after it', () => {
    const inTrip = { ...TRIP, status: 'in_trip' };
    expect(hubHeader(inTrip, [], new Date('2026-10-14T20:00:00Z'))).toEqual({
      phase: 'in',
      day: 4,
      days: 8,
    });
    expect(
      hubHeader({ ...TRIP, status: 'post_trip' }, [], new Date('2026-10-21T00:00:00Z')),
    ).toEqual({ phase: 'post', homeSince: '2026-10-19' });
  });

  it('writes the countdown as days and a clock', () => {
    expect(countdownClock((17 * 86_400 + 5 * 3600 + 26 * 60 + 29) * 1000, 'D')).toBe(
      '17D 05:26:29',
    );
    expect(countdownClock(-5, 'D')).toBe('00:00:00');
  });
});

describe('money tile', () => {
  const ME = 'me';
  const rows = [
    { debtor_id: 'dev', creditor_id: ME, amount_minor: 20_000, currency: 'USD' },
    { debtor_id: ME, creditor_id: 'alex', amount_minor: 1_400, currency: 'USD' },
    { debtor_id: ME, creditor_id: 'alex', amount_minor: 450_000_00, currency: 'IDR' },
  ];

  it("nets my ledger in the trip's currency", () => {
    expect(viewerNet(rows, ME, 'USD')).toEqual({ amountMinor: 18_600, currency: 'USD' });
    expect(viewerNet(rows, ME, 'IDR')).toEqual({ amountMinor: -450_000_00, currency: 'IDR' });
    expect(viewerNet([], ME, 'USD')).toBeNull();
  });
});
