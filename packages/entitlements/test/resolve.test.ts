import { describe, expect, it } from 'vitest';

import {
  boostActive,
  guideUnlimited,
  helpMap,
  iconStylesAll,
  passPlus,
  redraftLimit,
  seatCap,
  sponsored,
} from '../src/resolve';
import { systemClock, type Clock, type EntitlementSource } from '../src/sources';

const USER = 'user-1';
const TRIP = 'trip-1';
const CREW = 'crew-1';

function clockAt(iso: string): Clock {
  return { now: () => new Date(iso) };
}

const NOW = clockAt('2026-06-15T00:00:00Z');

describe('passPlus', () => {
  it('is false with no sources at all (true state before any purchase exists)', () => {
    expect(passPlus([], USER, NOW)).toBe(false);
  });

  it('is true for an active store subscription', () => {
    const sources: EntitlementSource[] = [
      { kind: 'store_sub', status: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z' },
    ];
    expect(passPlus(sources, USER, NOW)).toBe(true);
  });

  it('is true for a crew-year source only when the user is the buyer', () => {
    const buyerSources: EntitlementSource[] = [
      {
        kind: 'crew_year',
        crewId: CREW,
        buyerUserId: USER,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2027-01-01T00:00:00Z',
      },
    ];
    const memberSources: EntitlementSource[] = [
      {
        kind: 'crew_year',
        crewId: CREW,
        buyerUserId: 'someone-else',
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2027-01-01T00:00:00Z',
      },
    ];
    expect(passPlus(buyerSources, USER, NOW)).toBe(true);
    expect(passPlus(memberSources, USER, NOW)).toBe(false);
  });

  it("is true while an FTF grant on any of the user's trips is still active", () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'ftf',
        crewId: CREW,
        tripId: TRIP,
        startsAt: '2026-06-01T00:00:00Z',
        endsAt: '2026-06-20T00:00:00Z',
      },
    ];
    expect(passPlus(sources, USER, NOW)).toBe(true);
    expect(passPlus(sources, USER, clockAt('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('is true for an unexpired code grant', () => {
    const sources: EntitlementSource[] = [
      { kind: 'code_grant', expiresAt: '2026-09-01T00:00:00Z' },
    ];
    expect(passPlus(sources, USER, NOW)).toBe(true);
    expect(passPlus(sources, USER, clockAt('2026-10-01T00:00:00Z'))).toBe(false);
  });

  it('is false for a trip_boost source alone (Boost never grants Pass+)', () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'trip_boost',
        tripId: TRIP,
        startsAt: '2026-06-01T00:00:00Z',
        endsAt: '2026-07-01T00:00:00Z',
        status: 'active',
      },
    ];
    expect(passPlus(sources, USER, NOW)).toBe(false);
  });
});

describe('boostActive', () => {
  it('is true for an active trip_boost on the same trip', () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'trip_boost',
        tripId: TRIP,
        startsAt: '2026-06-01T00:00:00Z',
        endsAt: '2026-07-01T00:00:00Z',
        status: 'active',
      },
    ];
    expect(boostActive(sources, TRIP, CREW, NOW)).toBe(true);
  });

  it('ignores a trip_boost for a different trip', () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'trip_boost',
        tripId: 'other-trip',
        startsAt: '2026-06-01T00:00:00Z',
        endsAt: '2026-07-01T00:00:00Z',
        status: 'active',
      },
    ];
    expect(boostActive(sources, TRIP, CREW, NOW)).toBe(false);
  });

  it('is false once a trip_boost has ended, even before its formal status changes', () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'trip_boost',
        tripId: TRIP,
        startsAt: '2026-05-01T00:00:00Z',
        endsAt: '2026-06-01T00:00:00Z',
        status: 'active',
      },
    ];
    expect(boostActive(sources, TRIP, CREW, NOW)).toBe(false);
  });

  it('is false for a revoked, moved or credited boost regardless of its end date', () => {
    for (const status of ['revoked', 'moved', 'credit'] as const) {
      const sources: EntitlementSource[] = [
        {
          kind: 'trip_boost',
          tripId: TRIP,
          startsAt: '2026-06-01T00:00:00Z',
          endsAt: '2026-07-01T00:00:00Z',
          status,
        },
      ];
      expect(boostActive(sources, TRIP, CREW, NOW)).toBe(false);
    }
  });

  it("is true for any crew-year member (not just the buyer) on that crew's trips", () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'crew_year',
        crewId: CREW,
        buyerUserId: 'someone-else',
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2027-01-01T00:00:00Z',
      },
    ];
    expect(boostActive(sources, TRIP, CREW, NOW)).toBe(true);
  });

  it('ignores a crew-year grant for a different crew', () => {
    const sources: EntitlementSource[] = [
      {
        kind: 'crew_year',
        crewId: 'other-crew',
        buyerUserId: USER,
        validFrom: '2026-01-01T00:00:00Z',
        validTo: '2027-01-01T00:00:00Z',
      },
    ];
    expect(boostActive(sources, TRIP, CREW, NOW)).toBe(false);
  });
});

describe('iconStylesAll: the one capability the emulated pause overlay keeps', () => {
  it('is true while Pass+ is active', () => {
    const sources: EntitlementSource[] = [
      { kind: 'store_sub', status: 'active', currentPeriodEnd: '2027-01-01T00:00:00Z' },
    ];
    expect(iconStylesAll(sources, USER, NOW)).toBe(true);
  });

  it('stays true when the only source is a paused store subscription', () => {
    const sources: EntitlementSource[] = [
      { kind: 'store_sub', status: 'paused', currentPeriodEnd: '2027-01-01T00:00:00Z' },
    ];
    expect(passPlus(sources, USER, NOW)).toBe(false);
    expect(iconStylesAll(sources, USER, NOW)).toBe(true);
  });

  it('is false once expired or revoked', () => {
    for (const status of ['expired', 'revoked'] as const) {
      const sources: EntitlementSource[] = [
        { kind: 'store_sub', status, currentPeriodEnd: '2027-01-01T00:00:00Z' },
      ];
      expect(iconStylesAll(sources, USER, NOW)).toBe(false);
    }
  });
});

describe('pure combinators', () => {
  it('guideUnlimited is passPlus OR boostActive', () => {
    expect(guideUnlimited(false, false)).toBe(false);
    expect(guideUnlimited(true, false)).toBe(true);
    expect(guideUnlimited(false, true)).toBe(true);
    expect(guideUnlimited(true, true)).toBe(true);
  });

  it('redraftLimit is 3 for free/Pass+, unlimited under Boost', () => {
    expect(redraftLimit(false)).toBe(3);
    expect(redraftLimit(true)).toBe(Infinity);
  });

  it('seatCap is 6 for free/Pass+, 16 under Boost', () => {
    expect(seatCap(false)).toBe(6);
    expect(seatCap(true)).toBe(16);
  });

  it('sponsored shows only when neither passPlus nor boostActive hold', () => {
    expect(sponsored(false, false)).toBe(true);
    expect(sponsored(true, false)).toBe(false);
    expect(sponsored(false, true)).toBe(false);
    expect(sponsored(true, true)).toBe(false);
  });

  it('helpMap passes the active-session flag straight through', () => {
    expect(helpMap(true)).toBe(true);
    expect(helpMap(false)).toBe(false);
  });
});

describe('systemClock', () => {
  it('returns the real current time', () => {
    const before = Date.now();
    const now = systemClock.now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
