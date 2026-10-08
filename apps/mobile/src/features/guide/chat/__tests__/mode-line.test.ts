import { describe, expect, it } from '@jest/globals';

import { modeLineBreaks, unbroken } from '../components/mode-line';

const NBSP = ' ';

describe('where the guide header mode line may wrap', () => {
  it('keeps a date range whole, so a wrap falls before it and never inside it', () => {
    const line = modeLineBreaks(`Just me · Bali, ${unbroken('Oct 29–Nov 4')}`);
    expect(line.split(' ')).toEqual([
      'Just',
      `me${NBSP}·`,
      `Bali,${NBSP}Oct${NBSP}29–⁠Nov${NBSP}4`,
    ]);
  });

  it('never leaves the last word of a sentence on a line of its own', () => {
    const line = modeLineBreaks('Group mode · all 6 can see this');
    expect(line.split(' ').at(-1)).toBe(`see${NBSP}this`);
    expect(line).toContain(`mode${NBSP}·`);
  });

  it('leaves a line of two words able to wrap between them', () => {
    expect(modeLineBreaks('Just me')).toBe('Just me');
  });
});
