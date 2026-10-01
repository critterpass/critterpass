import { describe, expect, it } from 'vitest';

import { SEARCH_RESULT_LIMIT, foldPlaceText, indexPlaces, searchPlaces } from './place-search';
import type { PlaceRow } from './place-search';

const ROWS: readonly PlaceRow[] = [
  ['cp-151', 'Đà Nẵng', 'VN', 0, 'Chà Vá', 'Red-shanked douc langur', 'langur', 151],
  ['cp-005', 'Hội An', 'VN', 0, 'Chép', 'Lantern carp', 'cp-005', 5],
  ['cp-001', 'Hà Nội', 'VN', 0, 'Cụ Rùa', 'Hoàn Kiếm turtle', 'cp-001', 1],
  ['cp-016', 'Barcelona', 'ES', 0, 'Drac', 'Mosaic salamander', 'cp-016', 16],
  ['kyoto', '京都', 'JP', 0, 'Pon', 'Tanuki', 'tanuki', 61, 'Kyoto'],
  ['apt-anc', 'Anchorage', 'US', 1],
  ['apt-esb', 'Ankara', 'TR', 1],
  ['apt-lon', 'London', 'GB', 1],
  ['apt-yxu', 'London', 'CA', 2],
  ['apt-eln', 'East London', 'ZA', 2],
  ['apt-dlc', 'Dalian', 'CN', 1],
  ['apt-daz', 'Darwaz', 'AF', 3],
];
const places = indexPlaces(ROWS);
const keys = (query: string, limit?: number): string[] =>
  searchPlaces(places, query, limit).map((row) => row[0]);

describe('foldPlaceText', () => {
  it('drops diacritics, case and spare spaces', () => {
    expect(foldPlaceText('  Đà  Nẵng ')).toBe('da nang');
    expect(foldPlaceText('Hội An')).toBe('hoi an');
    expect(foldPlaceText('Reykjavík')).toBe('reykjavik');
  });
});

describe('searchPlaces', () => {
  it('finds Vietnamese cities typed without diacritics', () => {
    expect(keys('da nang')[0]).toBe('cp-151');
    expect(keys('DA NANG')[0]).toBe('cp-151');
    expect(keys('hoi an')[0]).toBe('cp-005');
    expect(keys('Đà Nẵng')[0]).toBe('cp-151');
  });

  it('meets a name typed with or without its spaces', () => {
    expect(keys('hanoi')).toEqual(['cp-001']);
    expect(keys('ha noi')).toEqual(['cp-001']);
    expect(keys('danang')[0]).toBe('cp-151');
  });

  it('ranks a name prefix before a later word, and that before a match inside', () => {
    // "an": Anchorage and Ankara start with it; Hội An has it as a later word.
    expect(keys('an')).toEqual(['apt-esb', 'apt-anc', 'cp-005']);
    // "lon": the two Londons start with it, East London has it as a word, Barcelona inside.
    expect(keys('lon')).toEqual(['apt-lon', 'apt-yxu', 'apt-eln', 'cp-016']);
  });

  it('puts catalogue cities before airport cities, then bigger airports first', () => {
    expect(keys('da')).toEqual(['cp-151', 'apt-dlc', 'apt-daz']);
  });

  it("finds a city by its local's name", () => {
    expect(keys('chep')).toEqual(['cp-005']);
    expect(keys('cu rua')).toEqual(['cp-001']);
  });

  it("finds a city by the page's name for it and by its original name", () => {
    expect(keys('京都')).toEqual(['kyoto']);
    expect(keys('kyo')).toEqual(['kyoto']);
  });

  it('returns nothing for an empty query or a name that is not a place', () => {
    expect(keys('')).toEqual([]);
    expect(keys('   ')).toEqual([]);
    expect(keys('zzzz')).toEqual([]);
    expect(keys('<script>')).toEqual([]);
  });

  it('never returns more than the cap', () => {
    const many = indexPlaces(
      Array.from({ length: 40 }, (_, n): PlaceRow => [`apt-a${n}`, `Santa ${n}`, 'US', 2]),
    );
    expect(searchPlaces(many, 'santa')).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(searchPlaces(many, 'santa', 3)).toHaveLength(3);
  });
});
