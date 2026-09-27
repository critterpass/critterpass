import { describe, expect, it } from 'vitest';

import { distanceM, isValidLatLng } from '../geo';
import { locationBatchSchema, recordVisitPayloadSchema, VISIT_DETECTION_VERSION } from '../wire';

const ids = {
  visit_id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f',
  trip_id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e60',
  poi_id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e61',
};

describe('record_visit payload', () => {
  it('fills evidence defaults and never carries coordinates', () => {
    const parsed = recordVisitPayloadSchema.parse({
      ...ids,
      source: 'geofence',
      arrived_at: '2026-10-12T02:00:00Z',
      left_at: '2026-10-12T02:30:00Z',
      evidence: { dwell_s: 1800, acc: 12 },
      lat: 1,
    });
    expect(parsed.evidence).toEqual({
      dwell_s: 1800,
      acc: 12,
      mock_flags: 0,
      detection_version: VISIT_DETECTION_VERSION,
    });
    expect(parsed).not.toHaveProperty('lat');
  });

  it('rejects a left_at before arrived_at and geofence visits without evidence', () => {
    const base = { ...ids, arrived_at: '2026-10-12T02:00:00Z' };
    expect(() =>
      recordVisitPayloadSchema.parse({
        ...base,
        source: 'manual',
        left_at: '2026-10-12T01:00:00Z',
      }),
    ).toThrow(/left_at/);
    expect(() => recordVisitPayloadSchema.parse({ ...base, source: 'geofence' })).toThrow(
      /evidence/,
    );
    expect(recordVisitPayloadSchema.parse({ ...base, source: 'expense' }).evidence).toBeUndefined();
  });
});

describe('fix batch', () => {
  it('defaults activity and mock flags and bounds the flags', () => {
    const batch = locationBatchSchema.parse({
      share_id: ids.trip_id,
      fixes: [{ lat: -8.5, lng: 115.2, acc: 8, at: '2026-10-12T02:00:00Z' }],
    });
    expect(batch.fixes[0]).toMatchObject({ activity: 'unknown', mock: 0 });
    expect(() =>
      locationBatchSchema.parse({
        share_id: ids.trip_id,
        fixes: [{ lat: 0, lng: 0, acc: 1, at: '2026-10-12T02:00:00Z', mock: 8 }],
      }),
    ).toThrow();
    expect(() => locationBatchSchema.parse({ share_id: ids.trip_id, fixes: [] })).toThrow();
  });
});

describe('geo', () => {
  it('measures distance and validates coordinates', () => {
    expect(distanceM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -1);
    expect(isValidLatLng({ lat: 91, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: Number.NaN })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: -181 })).toBe(false);
    expect(isValidLatLng({ lat: -8.5, lng: 115.2 })).toBe(true);
  });
});
