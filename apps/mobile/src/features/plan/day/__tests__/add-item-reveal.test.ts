// Skia's native renderer does not exist under Jest; see test-support/skia-double for the stand-in.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../../../ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';

import { revealOffset } from '../add-item-sheet';

describe('revealing the times after a place is picked', () => {
  it('scrolls just far enough to show the times above the foot of the list', () => {
    expect(revealOffset(0, 300, 900)).toBe(600);
    expect(revealOffset(120, 300, 500)).toBe(200);
  });

  it('stays put when the times already show in full', () => {
    expect(revealOffset(0, 600, 480)).toBeNull();
    expect(revealOffset(200, 300, 500)).toBeNull();
  });

  it('stays put before the list has been measured', () => {
    expect(revealOffset(0, 0, 900)).toBeNull();
  });
});
