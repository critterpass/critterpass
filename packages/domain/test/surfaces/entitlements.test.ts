import { describe, expect, it } from 'vitest';

import {
  buildEntitlementsSnapshot,
  ENTITLEMENTS_SNAPSHOT_SCHEMA_VERSION,
  entitlementsSnapshotSchema,
} from '../../src/surfaces/entitlements';

describe('buildEntitlementsSnapshot', () => {
  it('carries the schema version and generatedAt', () => {
    const snapshot = buildEntitlementsSnapshot({
      passPlus: true,
      boostedTrips: [],
      generatedAt: new Date('2026-06-15T00:00:00Z'),
    });
    expect(snapshot.schema).toBe(ENTITLEMENTS_SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.generatedAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('is null boostExpiresAt with no boosted trips', () => {
    const snapshot = buildEntitlementsSnapshot({
      passPlus: false,
      boostedTrips: [],
      generatedAt: new Date(),
    });
    expect(snapshot.boostedTripIds).toEqual([]);
    expect(snapshot.boostExpiresAt).toBeNull();
  });

  it('lists every boosted trip id and picks the soonest expiry', () => {
    const snapshot = buildEntitlementsSnapshot({
      passPlus: false,
      boostedTrips: [
        { tripId: '018f0000-0000-7000-8000-000000000001', endsAt: '2026-08-01T00:00:00Z' },
        { tripId: '018f0000-0000-7000-8000-000000000002', endsAt: '2026-07-01T00:00:00Z' },
      ],
      generatedAt: new Date('2026-06-15T00:00:00Z'),
    });
    expect(snapshot.boostedTripIds).toEqual([
      '018f0000-0000-7000-8000-000000000001',
      '018f0000-0000-7000-8000-000000000002',
    ]);
    expect(snapshot.boostExpiresAt).toBe('2026-07-01T00:00:00Z');
  });

  it('compares expiries by instant, not string order, across differing UTC offsets', () => {
    const snapshot = buildEntitlementsSnapshot({
      passPlus: false,
      boostedTrips: [
        // Lexicographically this sorts after the +00:00 row below, but it is chronologically sooner.
        { tripId: '018f0000-0000-7000-8000-000000000001', endsAt: '2026-06-15T09:00:00+08:00' },
        { tripId: '018f0000-0000-7000-8000-000000000002', endsAt: '2026-06-15T10:00:00+00:00' },
      ],
      generatedAt: new Date('2026-06-15T00:00:00Z'),
    });
    expect(snapshot.boostExpiresAt).toBe('2026-06-15T09:00:00+08:00');
  });

  it('produces output that validates against its own schema', () => {
    const snapshot = buildEntitlementsSnapshot({
      passPlus: true,
      boostedTrips: [
        { tripId: '018f0000-0000-7000-8000-000000000001', endsAt: '2026-08-01T00:00:00Z' },
      ],
      generatedAt: new Date('2026-06-15T00:00:00Z'),
    });
    expect(entitlementsSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it('rejects a schema version other than the current one', () => {
    expect(() =>
      entitlementsSnapshotSchema.parse({
        schema: 2,
        passPlus: false,
        boostedTripIds: [],
        boostExpiresAt: null,
        generatedAt: '2026-06-15T00:00:00Z',
      }),
    ).toThrow();
  });
});
