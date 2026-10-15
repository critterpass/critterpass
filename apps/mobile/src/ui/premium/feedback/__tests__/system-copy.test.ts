import { describe, expect, it } from '@jest/globals';

import { systemConfirmsCopy } from '../system-copy';

describe('who confirms a copy', () => {
  it('leaves it to Android 13 and later', () => {
    expect(systemConfirmsCopy('android', 33)).toBe(true);
    expect(systemConfirmsCopy('android', 36)).toBe(true);
  });

  it('has the app confirm it on iOS and older Androids', () => {
    expect(systemConfirmsCopy('android', 32)).toBe(false);
    expect(systemConfirmsCopy('ios', '26.5')).toBe(false);
  });
});
