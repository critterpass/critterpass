import { describe, expect, it } from '@jest/globals';

import { tieLastWords } from '../widow-tie';

const NBSP = ' ';

describe('tieLastWords', () => {
  it('ties the last two words so a wrap never leaves one alone', () => {
    expect(tieLastWords('It’s ready when you are.')).toBe(`It’s ready when you${NBSP}are.`);
    expect(tieLastWords('Bạn có thể đổi ở đây.')).toBe(`Bạn có thể đổi ở${NBSP}đây.`);
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
