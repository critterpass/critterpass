import { describe, expect, it } from '@jest/globals';

import { markReachEm, markRoom, marksClipped } from '../text/mark-room';

describe('room for stacked marks', () => {
  it('reads how tall the marks over each letter reach', () => {
    expect(markReachEm('Flying Dragon')).toBe(0.76);
    expect(markReachEm('Hà Nội')).toBe(0.8);
    expect(markReachEm('Đà Nẵng')).toBe(0.94);
    expect(markReachEm('Ỗ')).toBe(1.12);
    expect(markReachEm('Ấn')).toBe(1.12);
    expect(markReachEm('Ông')).toBe(0.94);
  });

  it('adds room on the 66 pt hero held to a 63 pt line box', () => {
    // The box keeps 63 − 0.24 × 66 ≈ 47 pt above the baseline; the circumflex reaches 53.
    expect(markRoom('Hà Nội', 66, 63)).toBe(6);
    expect(markRoom('Đà Nẵng', 66, 63)).toBe(15);
  });

  it("leaves the font's own line box alone unless two marks sit on a capital", () => {
    expect(markRoom('Hà Nội', 66, undefined)).toBe(0);
    expect(markRoom('Đà Nẵng', 34, undefined)).toBe(0);
    expect(markRoom('Hội An', 22, undefined)).toBe(0);
    expect(markRoom('Ỗ Mai', 66, undefined)).toBe(12);
  });

  it('leaves Latin text in a roomy line box alone', () => {
    expect(markRoom('Settle up', 32, 40)).toBe(0);
    expect(markRoom('Hà Nội', 13, 17.55)).toBe(0);
  });

  it('tells a cut first line from one with room', () => {
    const tight = { height: 63, descender: 15.8, ascender: 62.7 };
    expect(marksClipped('Hà Nội', tight, 0)).toBe(true);
    expect(marksClipped('Hà Nội', tight, 6)).toBe(false);
    expect(marksClipped('Flying', tight, 0)).toBe(true);
    expect(marksClipped('Flying', { height: 78.7, descender: 15.8, ascender: 62.7 }, 0)).toBe(
      false,
    );
  });
});
