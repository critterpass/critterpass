import { describe, expect, it } from '@jest/globals';

import { declutter, fitProjection } from '../map/label-layout';

const view = { width: 390, height: 844, padding: { top: 180, bottom: 380, left: 24, right: 170 } };

describe('label layout', () => {
  it('fits every point inside the strip between the header and the panel', () => {
    const points = [
      [115.2544, -8.5031],
      [115.2531, -8.4916],
      [115.2795, -8.5095],
    ] as const;
    const project = fitProjection(points, view);
    for (const [lng, lat] of points) {
      const [x, y] = project(lng, lat);
      expect(x).toBeGreaterThanOrEqual(23.9);
      expect(x).toBeLessThanOrEqual(390 - 170 + 0.1);
      expect(y).toBeGreaterThanOrEqual(179.9);
      expect(y).toBeLessThanOrEqual(844 - 380 + 0.1);
    }
  });

  it('lifts a label that would draw over one placed before it', () => {
    const project = (lng: number, lat: number): [number, number] => [lng, lat];
    const offsets = declutter(
      [
        { key: 'meetup', lng: 100, lat: 300, left: -100, width: 200, height: 50 },
        { key: 'alex', lng: 150, lat: 320, left: 0, width: 200, height: 46 },
        { key: 'far', lng: 100, lat: 100, left: 0, width: 200, height: 46 },
      ],
      project,
    );
    expect(offsets.get('meetup')).toEqual([0, 0]);
    // Alex's label (274–320) sits under the meet-up's (250–300): lifted clear above it.
    expect(offsets.get('alex')).toEqual([0, -74]);
    expect(offsets.get('far')).toEqual([0, 0]);
  });

  it('drops a label below the clash when lifting would pass under the header', () => {
    const project = (lng: number, lat: number): [number, number] => [lng, lat];
    const offsets = declutter(
      [
        { key: 'meetup', lng: 100, lat: 300, left: 0, width: 200, height: 50 },
        { key: 'alex', lng: 150, lat: 320, left: 0, width: 200, height: 46 },
      ],
      project,
      260,
    );
    // Lifting Alex (274–320) above the meet-up would reach 200 < 260: it drops to 304–350.
    expect(offsets.get('alex')).toEqual([0, 30]);
  });

  it('drops a label below the clash when lifting would pass under the header', () => {
    const project = (lng: number, lat: number): [number, number] => [lng, lat];
    const offsets = declutter(
      [
        { key: 'meetup', lng: 100, lat: 300, left: 0, width: 200, height: 50 },
        { key: 'alex', lng: 150, lat: 320, left: 0, width: 200, height: 46 },
      ],
      project,
      260,
    );
    // Lifting Alex (274–320) above the meet-up would reach 200 < 260: it drops to 304–350.
    expect(offsets.get('alex')).toEqual([0, 30]);
  });
});
