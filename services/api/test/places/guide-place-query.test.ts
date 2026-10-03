import { describe, expect, it } from 'vitest';

import { foldAccents, parseGuidePlaceQuery } from '../../src/places/guide-place-query';

describe('parseGuidePlaceQuery', () => {
  it('turns a typed kind into a hint and drops the city name, accents and case', () => {
    expect(parseGuidePlaceQuery('Khách sạn avatar đà nẵng', 'Đà Nẵng')).toEqual({
      words: ['avatar'],
      kind: 'stay',
      all: 'avatar:*',
      any: 'avatar:*',
    });
    expect(parseGuidePlaceQuery('ks Avatar DANANG', 'Da Nang').words).toEqual(['avatar']);
  });

  it('keeps every other word in order, as prefixes', () => {
    expect(parseGuidePlaceQuery('Cộng cà phê sân bay', 'Đà Nẵng')).toMatchObject({
      words: ['cong', 'ca', 'phe', 'san', 'bay'],
      kind: undefined,
      all: 'cong:* & ca:* & phe:* & san:* & bay:*',
    });
  });

  it('keeps a dish that looks like part of "thành phố"', () => {
    expect(parseGuidePlaceQuery('phở thành phố Hội An', 'Hội An').words).toEqual(['pho']);
  });

  it('leaves no query when only the kind or the city was typed', () => {
    expect(parseGuidePlaceQuery('hotel đà nẵng', 'Đà Nẵng')).toEqual({
      words: [],
      kind: 'stay',
      all: null,
      any: null,
    });
  });

  it('lets no tsquery operator through', () => {
    expect(parseGuidePlaceQuery("avatar' | !x & (y):*", null).any).toBe('avatar:*');
  });

  it('folds đ the way unaccent does', () => {
    expect(foldAccents('Đường Đà')).toBe('duong da');
  });
});
