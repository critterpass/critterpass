import { describe, expect, it } from '@jest/globals';

import { frame, straightLine, walkingDirectionsUrl } from '../session-map/walking-route';

const sender = { lat: 16.0611, lng: 108.2272 };
const me = { lat: 16.0678, lng: 108.2208 };

describe('SOS session map', () => {
  it('draws a line only once both ends are known, as lng/lat pairs', () => {
    expect(straightLine(null, sender)).toBeNull();
    expect(straightLine(me, null)).toBeNull();
    expect(straightLine(me, sender)).toEqual([
      [108.2208, 16.0678],
      [108.2272, 16.0611],
    ]);
  });

  it('frames both people, and the sender alone before this phone has a position', () => {
    expect(frame(null, sender)).toEqual({ centre: sender, zoom: 15 });
    const near = frame(me, sender);
    expect(near.zoom).toBe(15);
    expect(near.centre.lat).toBeCloseTo(16.06445, 5);
    expect(frame({ lat: 15.88, lng: 108.33 }, sender).zoom).toBeLessThan(near.zoom);
  });

  it("hands walking directions to the phone's maps app", () => {
    expect(walkingDirectionsUrl(sender, 'ios')).toBe(
      'https://maps.apple.com/?daddr=16.061100,108.227200&dirflg=w',
    );
    expect(walkingDirectionsUrl(sender, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=16.061100,108.227200&travelmode=walking',
    );
  });
});
