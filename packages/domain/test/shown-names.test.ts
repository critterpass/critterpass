import { describe, expect, it } from 'vitest';

import { readsLocalNames, shownName, shownPlaceName } from '../src/places/shown-names';

const valley = { name: 'Valley of Love', nameLocal: 'Thung lũng Tình Yêu' };

describe('the name a place is shown under', () => {
  it('is the local name for a reader of the destination’s language', () => {
    expect(readsLocalNames('vi', ['vi'])).toBe(true);
    expect(readsLocalNames('vi-VN', ['VI'])).toBe(true);
    expect(shownPlaceName(valley, true)).toEqual({
      shown: 'Thung lũng Tình Yêu',
      other: 'Valley of Love',
    });
  });

  it('is the first name for anyone else, with the local one beside it', () => {
    expect(readsLocalNames('en', ['vi'])).toBe(false);
    expect(readsLocalNames(undefined, ['vi'])).toBe(false);
    expect(readsLocalNames('vi', [])).toBe(false);
    expect(shownPlaceName(valley, false)).toEqual({
      shown: 'Valley of Love',
      other: 'Thung lũng Tình Yêu',
    });
  });

  it('is the first name when there is no local one, or it is the same', () => {
    expect(shownName({ name: 'Maze Bar', nameLocal: '  ' }, true)).toBe('Maze Bar');
    expect(shownPlaceName({ name: 'Bánh Căn', nameLocal: 'Bánh Căn' }, true)).toEqual({
      shown: 'Bánh Căn',
      other: null,
    });
  });
});
