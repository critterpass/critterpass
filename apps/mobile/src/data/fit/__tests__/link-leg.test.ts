/** A day trip's way there reaches the phone's fit as known travel, never as a straight line. */
import { describe, expect, it } from '@jest/globals';

import { fitContextFromWire, type WireFitContext } from '../local-fit';

const STAY = { key: 'stay', lat: -13.5167, lng: -71.9781 };
const GATE = { key: 'gate', lat: -13.1631, lng: -72.545 };
const wire = (mode: string) =>
  ({
    days: [],
    driveFactor: 1.4,
    legs: [{ from: 'stay', to: 'gate', minutes: 210, mode, approx: false }],
  }) as unknown as WireFitContext;

describe('fitContextFromWire', () => {
  it("keeps a link leg's minutes, as time not walked and as an estimate", () => {
    expect(fitContextFromWire(wire('train')).travel?.(STAY, GATE)).toEqual({
      minutes: 210,
      mode: 'drive',
      approx: true,
    });
  });

  it('still works out a leg whose mode it does not know from the straight line', () => {
    const leg = fitContextFromWire(wire('teleport')).travel?.(STAY, GATE);
    expect(leg?.minutes).not.toBe(210);
  });
});
