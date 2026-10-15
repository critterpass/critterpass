import { describe, expect, it } from '@jest/globals';

import { tieLastWords } from '../widow-tie';

const NBSP = ' ';

describe('tieLastWords', () => {
  it('ties the last two words so a wrap never leaves one alone', () => {
    expect(tieLastWords('Tokek drafts the whole plan tonight.')).toBe(
      `Tokek drafts the whole plan${NBSP}tonight.`,
    );
    expect(tieLastWords('Tokek checks the forecast every morning.')).toBe(
      `Tokek checks the forecast every${NBSP}morning.`,
    );
  });

  it('ties a third word when the last two are short enough to look stray', () => {
    expect(tieLastWords('It’s ready when you are.')).toBe(`It’s ready when${NBSP}you${NBSP}are.`);
    expect(tieLastWords('Bạn có thể đổi trong cài đặt.')).toBe(
      `Bạn có thể đổi trong${NBSP}cài${NBSP}đặt.`,
    );
    expect(tieLastWords('Your crew sees it, or not.')).toBe(
      `Your crew sees it,${NBSP}or${NBSP}not.`,
    );
    expect(tieLastWords('Pick one, you can change it from here.')).toBe(
      `Pick one, you can change it${NBSP}from${NBSP}here.`,
    );
    // Too long to carry down whole: two stay tied.
    expect(tieLastWords('Ask before the extraordinarily long up.')).toBe(
      `Ask before the extraordinarily long${NBSP}up.`,
    );
  });

  it('leaves short lines, multi-line copy and long pairs as written', () => {
    expect(tieLastWords('Two words')).toBe('Two words');
    expect(tieLastWords('First line\nsecond line here')).toBe('First line\nsecond line here');
    const long = 'Forward it to bali-demo-crew@in.critterpass.app';
    expect(tieLastWords(long)).toBe(long);
  });

  it('keeps trailing space and ignores doubled spaces', () => {
    expect(tieLastWords('one two three ')).toBe(`one two${NBSP}three `);
    expect(tieLastWords('one two  three')).toBe('one two  three');
  });
});
