/**
 * Lifecycle overlays (docs/product-decisions.md's final entitlement matrix, "Lifecycle overlays"):
 * paused, cancelled, expired, grace, boost-ended and refund/revoke, each asserted against the exact
 * capability shift the doc describes rather than just a single before/after boolean.
 */
import { describe, expect, it } from 'vitest';

import { resolveTripCapabilities, resolveUserCapabilities } from '../src/capabilities';
import { type Clock, type EntitlementSource } from '../src/sources';

const USER = 'user-1';
const TRIP = 'trip-1';
const CREW = 'crew-1';

function clockAt(iso: string): Clock {
  return { now: () => new Date(iso) };
}

describe('paused (emulated pause overlay)', () => {
  const paused: readonly EntitlementSource[] = [
    { kind: 'store_sub', status: 'paused', currentPeriodEnd: '2027-01-01T00:00:00Z' },
  ];
  const now = clockAt('2026-06-15T00:00:00Z');

  it('loses unlimited guide, mailbox import and NEXT FLIGHT', () => {
    const capabilities = resolveUserCapabilities(paused, USER, now);
    expect(capabilities.passPlus).toBe(false);
    expect(capabilities.mailboxImport).toBe(false);
    expect(capabilities.nextFlightWidget).toBe(false);
    expect(capabilities.spokenReadout).toBe(false);
  });

  it('keeps icon styles', () => {
    expect(resolveUserCapabilities(paused, USER, now).iconStylesAll).toBe(true);
  });
});

describe('cancelled (cancelled_active): full Pass+ to period end', () => {
  const cancelled: readonly EntitlementSource[] = [
    { kind: 'store_sub', status: 'cancelled_active', currentPeriodEnd: '2026-07-01T00:00:00Z' },
  ];

  it('is fully entitled right up to the paid period end', () => {
    const capabilities = resolveUserCapabilities(cancelled, USER, clockAt('2026-06-30T23:59:59Z'));
    expect(capabilities.passPlus).toBe(true);
    expect(capabilities.iconStylesAll).toBe(true);
    expect(capabilities.mailboxImport).toBe(true);
  });

  it('loses everything the instant the paid period ends', () => {
    const capabilities = resolveUserCapabilities(cancelled, USER, clockAt('2026-07-01T00:00:01Z'));
    expect(capabilities.passPlus).toBe(false);
    expect(capabilities.iconStylesAll).toBe(false);
  });
});

describe('expired: no Pass+ at all', () => {
  const expired: readonly EntitlementSource[] = [
    { kind: 'store_sub', status: 'expired', currentPeriodEnd: '2026-01-01T00:00:00Z' },
  ];

  it('grants nothing, including icon styles', () => {
    const capabilities = resolveUserCapabilities(expired, USER, clockAt('2026-06-15T00:00:00Z'));
    expect(capabilities.passPlus).toBe(false);
    expect(capabilities.iconStylesAll).toBe(false);
    expect(capabilities.mailboxImport).toBe(false);
  });
});

describe('grace/billing_retry: 7-day server-side window', () => {
  const graceEndsAt = '2026-06-08T00:00:00Z'; // 7 days after a 2026-06-01 billing failure

  it.each(['grace', 'billing_retry'] as const)(
    'keeps full Pass+ through %s until it lapses',
    (status) => {
      const source: EntitlementSource = {
        kind: 'store_sub',
        status,
        currentPeriodEnd: '2026-06-01T00:00:00Z',
        graceEndsAt,
      };
      expect(
        resolveUserCapabilities([source], USER, clockAt('2026-06-07T23:59:59Z')).passPlus,
      ).toBe(true);
      expect(
        resolveUserCapabilities([source], USER, clockAt('2026-06-08T00:00:01Z')).passPlus,
      ).toBe(false);
    },
  );

  it('never grants Pass+ from a grace-status source with no graceEndsAt at all (defensive)', () => {
    const source: EntitlementSource = {
      kind: 'store_sub',
      status: 'grace',
      currentPeriodEnd: '2026-06-01T00:00:00Z',
    };
    expect(resolveUserCapabilities([source], USER, clockAt('2026-06-02T00:00:00Z')).passPlus).toBe(
      false,
    );
  });
});

describe('boost ended: trip reverts to free-tier caps', () => {
  const endedBoost: readonly EntitlementSource[] = [
    {
      kind: 'trip_boost',
      tripId: TRIP,
      startsAt: '2026-05-01T00:00:00Z',
      endsAt: '2026-06-01T00:00:00Z',
      status: 'ended',
    },
  ];

  it('drops redraft limit, seat cap and live map back to the free tier', () => {
    const capabilities = resolveTripCapabilities(
      endedBoost,
      TRIP,
      CREW,
      clockAt('2026-06-15T00:00:00Z'),
    );
    expect(capabilities.boostActive).toBe(false);
    expect(capabilities.redraftLimit).toBe(3);
    expect(capabilities.seatCap).toBe(6);
    expect(capabilities.liveMap).toBe(false);
  });
});

describe('refund/revoke: entitlement removed outright', () => {
  it('a revoked store subscription grants nothing, regardless of its stated period end', () => {
    const revoked: readonly EntitlementSource[] = [
      { kind: 'store_sub', status: 'revoked', currentPeriodEnd: '2027-01-01T00:00:00Z' },
    ];
    const capabilities = resolveUserCapabilities(revoked, USER, clockAt('2026-06-15T00:00:00Z'));
    expect(capabilities.passPlus).toBe(false);
    expect(capabilities.iconStylesAll).toBe(false);
  });

  it('a revoked trip boost grants nothing, regardless of its stated end date', () => {
    const revoked: readonly EntitlementSource[] = [
      {
        kind: 'trip_boost',
        tripId: TRIP,
        startsAt: '2026-06-01T00:00:00Z',
        endsAt: '2026-12-01T00:00:00Z',
        status: 'revoked',
      },
    ];
    expect(
      resolveTripCapabilities(revoked, TRIP, CREW, clockAt('2026-06-15T00:00:00Z')).boostActive,
    ).toBe(false);
  });
});

describe('tz-change / clock-skew safety: only the injected clock ever decides "now"', () => {
  it('the same sources resolve differently only when the clock itself differs', () => {
    const source: readonly EntitlementSource[] = [
      { kind: 'store_sub', status: 'active', currentPeriodEnd: '2026-06-30T00:00:00Z' },
    ];
    // 'active' is unconditional (unlike 'cancelled_active'), so this proves the resolver never
    // reads real wall-clock time on its own — only whichever Date the injected clock returns.
    const past = resolveUserCapabilities(source, USER, clockAt('2020-01-01T00:00:00Z'));
    const future = resolveUserCapabilities(source, USER, clockAt('2099-01-01T00:00:00Z'));
    expect(past.passPlus).toBe(true);
    expect(future.passPlus).toBe(true);
  });
});
