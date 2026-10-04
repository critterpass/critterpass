import { describe, expect, it } from 'vitest';

import {
  decodePolyline,
  encodePolyline,
  simplifyPath,
  type LngLat,
} from '../../src/routing/polyline';

describe('encoded polylines', () => {
  it('matches the reference encoding at precision 5', () => {
    // The format's documented example: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453).
    const points: LngLat[] = [
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ];
    expect(encodePolyline(points, 5)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)).toEqual(points);
  });

  it('round-trips at precision 6 across hemispheres', () => {
    const points: LngLat[] = [
      [108.227219, 16.061101],
      [108.263345, 16.003912],
      [-0.000001, -0.000001],
      [179.999999, -89.999999],
      [-179.999999, 89.999999],
    ];
    expect(decodePolyline(encodePolyline(points, 6), 6)).toEqual(points);
  });

  it('decodes a cut-off string up to the last whole point', () => {
    const encoded = encodePolyline(
      [
        [108.2272, 16.0611],
        [108.2633, 16.0039],
      ],
      6,
    );
    expect(decodePolyline(encoded.slice(0, -1), 6)).toEqual([[108.2272, 16.0611]]);
    expect(decodePolyline('', 6)).toEqual([]);
  });
});

describe('simplifyPath', () => {
  /** A street running east with a 1 m wobble and one 40 m detour north halfway. */
  const street: LngLat[] = Array.from({ length: 101 }, (_, i) => {
    const wobble = i % 2 === 0 ? 0 : 0.000009;
    const detour = i === 50 ? 0.00036 : 0;
    return [108.2 + i * 0.0001, 16.0 + wobble + detour];
  });

  it('drops points within the tolerance and keeps the ends and real turns', () => {
    const simplified = simplifyPath(street, { toleranceM: 5, maxPoints: 200 });
    expect(simplified[0]).toEqual(street[0]);
    expect(simplified.at(-1)).toEqual(street.at(-1));
    expect(simplified).toContainEqual(street[50]);
    expect(simplified.length).toBeLessThan(10);
  });

  it('raises the tolerance until the shape fits the point budget', () => {
    const zigzag: LngLat[] = Array.from({ length: 5000 }, (_, i) => [
      108 + i * 0.0001,
      16 + (i % 2) * 0.001,
    ]);
    const simplified = simplifyPath(zigzag, { toleranceM: 5, maxPoints: 200 });
    expect(simplified.length).toBeLessThanOrEqual(200);
    expect(simplified.length).toBeGreaterThanOrEqual(2);
    expect(simplified[0]).toEqual(zigzag[0]);
    expect(simplified.at(-1)).toEqual(zigzag.at(-1));
  });

  it('keeps short and repeated-point shapes whole', () => {
    expect(
      simplifyPath(
        [
          [1, 1],
          [1, 1],
          [2, 2],
        ],
        { toleranceM: 5, maxPoints: 200 },
      ),
    ).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });
});
