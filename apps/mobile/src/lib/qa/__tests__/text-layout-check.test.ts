/** The text layout checks: a split word, lost characters, a cut line and a wrapped label. */
import { describe, expect, it } from '@jest/globals';

import { hasWordBreak, isTruncated, textLayoutProblems } from '../text-layout-check';

describe('layout checks', () => {
  it('finds a word split across lines, but not a word-wrapped line or a script without spaces', () => {
    expect(hasWordBreak([{ text: 'SG' }, { text: 'N' }])).toBe(true);
    expect(hasWordBreak([{ text: 'CRITTERPA' }, { text: 'SS' }])).toBe(true);
    expect(hasWordBreak([{ text: 'WHAT SHOULD THE ' }, { text: 'GUIDES CALL YOU?' }])).toBe(false);
    expect(hasWordBreak([{ text: 'BẠN LÀ ' }, { text: 'GÌ?' }])).toBe(false);
    expect(hasWordBreak([{ text: '京都の' }, { text: '旅' }])).toBe(false);
  });

  it('finds lost characters and a trailing ellipsis', () => {
    expect(isTruncated([{ text: 'WHAT SHOUL…' }], 'WHAT SHOULD THE GUIDES CALL YOU?')).toBe(true);
    expect(
      isTruncated([{ text: 'PICK YOUR ' }, { text: 'PASSPORT PHOTO' }], 'PICK YOUR PASSPORT PHOTO'),
    ).toBe(false);
  });

  it('reads a shorter layout of text with no line limit as stale, not cut', () => {
    // A streaming answer grows between the layout and the event: the lines hold the earlier text.
    const stale = {
      lines: [{ text: "Let me check what the weather's actually " }],
      text: "Let me check what the weather's actually doing in Ubud",
      truncationIsBug: true,
    };
    expect(textLayoutProblems({ ...stale, lineLimited: false })).toEqual([]);
    expect(textLayoutProblems({ ...stale, lineLimited: true })).toEqual(['TEXT_TRUNCATED']);
  });

  it('treats a caller-chosen ellipsis as intended', () => {
    const cut = { lines: [{ text: 'HO CHI MINH…' }], text: 'HO CHI MINH CITY' };
    expect(textLayoutProblems({ ...cut, truncationIsBug: false })).toEqual([]);
    expect(textLayoutProblems({ ...cut, truncationIsBug: true })).toEqual(['TEXT_TRUNCATED']);
  });

  it('finds a one-line label laid out on two lines', () => {
    const wrapped = { lines: [{ text: 'PING ' }, { text: 'ALL' }], text: 'PING ALL' };
    expect(textLayoutProblems({ ...wrapped, truncationIsBug: false, singleLine: true })).toEqual([
      'TEXT_WRAPPED',
    ]);
    expect(textLayoutProblems({ ...wrapped, truncationIsBug: false })).toEqual([]);
    expect(
      textLayoutProblems({
        lines: [{ text: 'PING ALL' }],
        text: 'PING ALL',
        truncationIsBug: false,
        singleLine: true,
      }),
    ).toEqual([]);
  });
});
