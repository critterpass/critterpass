import { describe, expect, it } from 'vitest';

import {
  estimateStraightLineEta,
  straightLineEtaProvider,
} from '../../src/routing/straight-line-eta';

describe('estimateStraightLineEta', () => {
  it('flags every result as an estimate from the straight_line source', () => {
    const result = estimateStraightLineEta({
      originLat: 35.0,
      originLng: 135.0,
      destLat: 35.0,
      destLng: 135.0,
      mode: 'pedestrian',
    });
    expect(result.estimate).toBe(true);
    expect(result.source).toBe('straight_line');
    expect(result.mode).toBe('pedestrian');
  });

  it('returns just the buffer for the same origin and destination', () => {
    const result = estimateStraightLineEta({
      originLat: 35.0,
      originLng: 135.0,
      destLat: 35.0,
      destLng: 135.0,
      mode: 'auto',
    });
    expect(result.distanceM).toBe(0);
    expect(result.minutes).toBe(3);
  });

  it('gives a faster mode a shorter ETA over the same distance', () => {
    const input = { originLat: 35.0, originLng: 135.0, destLat: 35.02, destLng: 135.02 } as const;
    const walking = estimateStraightLineEta({ ...input, mode: 'pedestrian' });
    const driving = estimateStraightLineEta({ ...input, mode: 'auto' });
    expect(driving.minutes).toBeLessThan(walking.minutes);
    expect(driving.distanceM).toBe(walking.distanceM);
  });

  it('applies the detour factor on top of the raw straight-line distance', () => {
    // ~0.01 deg longitude at the equator is close to 1113 m; the detour factor (1.35x) should push
    // the reported distance above that raw figure.
    const result = estimateStraightLineEta({
      originLat: 0,
      originLng: 0,
      destLat: 0,
      destLng: 0.01,
      mode: 'pedestrian',
    });
    expect(result.distanceM).toBeGreaterThan(1113);
  });
});

describe('straightLineEtaProvider', () => {
  it('matches estimateStraightLineEta through the RouteEtaProvider interface', async () => {
    const input = {
      originLat: 35.0,
      originLng: 135.0,
      destLat: 35.01,
      destLng: 135.01,
      mode: 'motor_scooter' as const,
    };
    expect(await straightLineEtaProvider.eta(input)).toEqual(estimateStraightLineEta(input));
  });
});
