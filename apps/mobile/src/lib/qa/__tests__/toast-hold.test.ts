import { describe, expect, it } from '@jest/globals';

import { qaToastHold, readQaToastHoldLink } from '../toast-hold';

describe('capture toast hold', () => {
  it('keeps toasts up for the link’s hold, and only for two minutes after it', () => {
    expect(qaToastHold(4000, 0, true)).toBe(4000);
    readQaToastHoldLink('critterpass-dev://wallet/money?qaToastHold=15000', 1000);
    expect(qaToastHold(4000, 2000, true)).toBe(15000);
    // A longer toast of its own keeps its own.
    expect(qaToastHold(20000, 2000, true)).toBe(20000);
    expect(qaToastHold(4000, 200_000, true)).toBe(4000);
    expect(qaToastHold(4000, 2000, true)).toBe(4000);
  });

  it('ignores links without it, and never applies outside QA builds', () => {
    readQaToastHoldLink('critterpass-dev://wallet/money', 0);
    expect(qaToastHold(4000, 10, true)).toBe(4000);
    readQaToastHoldLink('critterpass-dev://wallet/money?a=1&qaToastHold=9000', 0);
    expect(qaToastHold(4000, 10, false)).toBe(4000);
    expect(qaToastHold(4000, 10, true)).toBe(9000);
  });
});
