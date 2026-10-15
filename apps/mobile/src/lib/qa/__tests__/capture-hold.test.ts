import { describe, expect, it } from '@jest/globals';

import { qaToastHold, qaZoomMs, qaZoomPending, readCaptureHoldLink } from '../capture-hold';

describe('capture holds', () => {
  it('keeps toasts up for the link’s hold, and only for two minutes after it', () => {
    expect(qaToastHold(4000, 0, true)).toBe(4000);
    readCaptureHoldLink('critterpass-dev://wallet/money?qaToastHold=15000', 1000);
    expect(qaToastHold(4000, 2000, true)).toBe(15000);
    // A longer toast of its own keeps its own.
    expect(qaToastHold(20000, 2000, true)).toBe(20000);
    expect(qaToastHold(4000, 200_000, true)).toBe(4000);
    expect(qaToastHold(4000, 2000, true)).toBe(4000);
  });

  it('slows only the next zoom', () => {
    readCaptureHoldLink('critterpass-dev://trips?qaZoomMs=12000', 0);
    expect(qaZoomMs(560, 10, true)).toBe(12000);
    expect(qaZoomMs(560, 20, true)).toBe(560);
  });

  it('asks for the next zoom even under reduced motion until it runs or the window ends', () => {
    readCaptureHoldLink('critterpass-dev://?qaZoomMs=12000', 0);
    expect(qaZoomPending(10, true)).toBe(true);
    expect(qaZoomPending(10, false)).toBe(false);
    expect(qaZoomPending(200_000, true)).toBe(false);
    qaZoomMs(560, 20, true);
    expect(qaZoomPending(30, true)).toBe(false);
  });

  it('ignores links without a hold, and never applies outside QA builds', () => {
    readCaptureHoldLink('critterpass-dev://wallet/money', 0);
    expect(qaToastHold(4000, 10, true)).toBe(4000);
    expect(qaZoomMs(560, 10, true)).toBe(560);
    readCaptureHoldLink('critterpass-dev://wallet/money?a=1&qaToastHold=9000', 0);
    expect(qaToastHold(4000, 10, false)).toBe(4000);
    expect(qaToastHold(4000, 10, true)).toBe(9000);
  });
});
