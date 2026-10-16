import { describe, expect, it } from 'vitest';

import {
  boxHolds,
  curatedBox,
  distanceKm,
  redrawnBox,
} from '../../../src/places/curated-load/bounds';

// Ninh Bình's sights around Tràng An and Tam Cốc, and a day trip to Cúc Phương 40 km out.
const town = [
  { lat: 20.2506, lng: 105.9745 },
  { lat: 20.2547, lng: 105.9002 },
  { lat: 20.2167, lng: 105.9373 },
  { lat: 20.2869, lng: 105.9058 },
  { lat: 20.2444, lng: 105.9167 },
  { lat: 20.2301, lng: 105.9282 },
];
const dayTrip = { lat: 20.3167, lng: 105.6083 };

describe('curatedBox', () => {
  it('draws the box around the in-town points and leaves the day trip out', () => {
    const drawn = curatedBox([...town, dayTrip]);
    expect(drawn?.kept).toEqual(town);
    const box = drawn!.box;
    expect(boxHolds(box, town)).toBe(true);
    expect(boxHolds(box, [dayTrip])).toBe(false);
    // Padded past the outermost sight.
    expect(box.minLng).toBeLessThan(105.9002);
    expect(box.maxLat).toBeGreaterThan(20.2869);
  });

  it('is about 8 km a side around points close together', () => {
    const close = town.map((_, i) => ({ lat: 20.25 + i * 0.001, lng: 105.97 + i * 0.001 }));
    const box = curatedBox(close)!.box;
    const north = { lat: box.maxLat, lng: box.minLng };
    const east = { lat: box.minLat, lng: box.maxLng };
    expect(distanceKm({ lat: box.minLat, lng: box.minLng }, north)).toBeGreaterThan(7.9);
    expect(distanceKm({ lat: box.minLat, lng: box.minLng }, east)).toBeGreaterThan(7.9);
  });

  it('says nothing about a destination with too few points', () => {
    expect(curatedBox(town.slice(0, 4))).toBeNull();
  });
});

describe('redrawnBox', () => {
  it('replaces a box drawn on the wrong place of the same name', () => {
    // The locality lookup boxed a Ninh Bình in Ninh Thuận.
    const wrong = { minLng: 108.734, minLat: 11.719, maxLng: 108.844, maxLat: 11.826 };
    const box = redrawnBox(wrong, [...town, dayTrip]);
    expect(box).not.toBeNull();
    expect(boxHolds(box, town)).toBe(true);
  });

  it('keeps a box that already holds the points, and draws one where there is none', () => {
    const right = { minLng: 105.85, minLat: 20.15, maxLng: 106.05, maxLat: 20.35 };
    expect(redrawnBox(right, [...town, dayTrip])).toBeNull();
    expect(redrawnBox(null, town)).not.toBeNull();
  });
});
