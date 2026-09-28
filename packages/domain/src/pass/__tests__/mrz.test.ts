import { describe, expect, it } from 'vitest';

import { mrzLines, mrzName, MRZ_LINE_LENGTH } from '../mrz';
import { formatPassNumber, mrzPassNumber, PASS_NUMBER_PLACEHOLDER } from '../number';

describe('mrzName', () => {
  it.each([
    ['Winston', 'WINSTON'],
    ['Mary-Jane', 'MARY<JANE'],
    ["O'Brien", 'OBRIEN'],
    ['Jürgen', 'JUERGEN'],
    ['Søren', 'SOEREN'],
    ['Straße', 'STRASSE'],
    ['José', 'JOSE'],
    ['Nguyễn Thị Đào', 'NGUYEN<THI<DAO'],
    ['Phương', 'PHUONG'],
    ['Łukasz', 'LUKASZ'],
    ['Дмитрий', 'DMITRII'],
    ['Юлия', 'IULIIA'],
    ['Γιώργος', 'GIORGOS'],
    ['Ana 🌴', 'ANA'],
  ])('%s → %s', (name, expected) => {
    expect(mrzName(name)).toBe(expected);
  });

  it('turns characters without an ICAO mapping into fillers', () => {
    expect(mrzName('美咲')).toBe('');
    expect(mrzName('Ken 健')).toBe('KEN');
    expect(mrzName('健 Ken')).toBe('KEN');
    expect(mrzName('A美B')).toBe('A<B');
  });
});

describe('mrzLines', () => {
  it('draws the in-progress pass from 3a-2', () => {
    const [line1, line2] = mrzLines({
      givenName: 'Winst',
      number: 'CP-0427',
      homeIso3: null,
      styleTags: [],
      stampCount: 0,
    });
    expect(line1).toBe('P<CPWINST'.padEnd(MRZ_LINE_LENGTH, '<'));
    expect(line2).toBe(`${'CP0427'.padEnd(MRZ_LINE_LENGTH - 2, '<')}00`);
  });

  it('draws the issued pass from 3a-6', () => {
    const [line1, line2] = mrzLines({
      givenName: 'Winston',
      number: 'CP-0427',
      homeIso3: 'SGP',
      styleTags: ['early_starts', 'street_food', 'easy_pace'],
      stampCount: 1,
    });
    expect(line1).toBe('P<SGPWINSTON'.padEnd(44, '<'));
    expect(line2).toBe(`${'CP0427<<SGP<<SUNRISE<FOOD<EASY'.padEnd(42, '<')}01`);
    expect(line1).toHaveLength(44);
    expect(line2).toHaveLength(44);
  });

  it('keeps the CJK fallback line valid and within the ICAO alphabet', () => {
    const [line1, line2] = mrzLines({
      givenName: '美咲',
      number: null,
      homeIso3: 'JPN',
      styleTags: [],
      stampCount: 3,
    });
    expect(line1).toBe('P<JPN'.padEnd(44, '<'));
    expect(line2).toBe(`${'CP<<JPN'.padEnd(42, '<')}03`);
    for (const line of [line1, line2]) expect(line).toMatch(/^[A-Z0-9<]{44}$/u);
  });

  it('truncates a long name to the line', () => {
    const [line1] = mrzLines({
      givenName: 'Maximiliana Wilhelmina Aurora',
      number: null,
      homeIso3: 'DEU',
      styleTags: [],
      stampCount: 0,
    });
    expect(line1).toHaveLength(44);
    expect(line1.startsWith('P<DEUMAXIMILIANA<WILHELMINA<AURORA')).toBe(true);
  });
});

describe('pass numbers', () => {
  it('formats and reads pass numbers', () => {
    expect(formatPassNumber(427)).toBe('CP-0427');
    expect(formatPassNumber(123456)).toBe('CP-123456');
    expect(mrzPassNumber('CP-0427')).toBe('CP0427');
    expect(mrzPassNumber(PASS_NUMBER_PLACEHOLDER)).toBe('CP');
    expect(mrzPassNumber(null)).toBe('CP');
    expect(() => formatPassNumber(0)).toThrow(RangeError);
  });
});
