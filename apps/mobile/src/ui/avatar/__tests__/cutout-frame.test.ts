import { describe, expect, it } from '@jest/globals';

import { cutoutFrame } from '../cutout-frame';

describe('cutoutFrame', () => {
  it('bottom-anchors a portrait cut-out and sinks its flat edge under the rim', () => {
    const frame = cutoutFrame(140, 6, 300, 400);
    expect(frame.height).toBeCloseTo(140, 5);
    expect(frame.width).toBeCloseTo(105, 5);
    expect(frame.x).toBeCloseTo(17.5, 5);
    // Its bottom (and the outline traced along it) sits one outline below the frame.
    expect(frame.y + frame.height).toBeCloseTo(146, 5);
  });

  it('keeps a wide cut-out inside the side insets, still on the bottom edge', () => {
    const frame = cutoutFrame(140, 6, 800, 400);
    expect(frame.width).toBeCloseTo(128, 5);
    expect(frame.x).toBeCloseTo(6, 5);
    expect(frame.y + frame.height).toBeCloseTo(146, 5);
  });

  it('fills the frame for an image with no size yet', () => {
    expect(cutoutFrame(140, 6, 0, 0)).toEqual({ x: 0, y: 0, width: 140, height: 140 });
  });
});
