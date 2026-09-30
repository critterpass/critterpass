import { describe, expect, it } from 'vitest';

import { upper, upperKeepingCurrency } from '../src/upper';

describe('upper', () => {
  it('uppercases Turkish "i" to the dotted İ, not the dotless I plain toUpperCase gives', () => {
    expect(upper('istanbul', 'tr')).toBe('İSTANBUL');
  });

  it('drops the accent when uppercasing Greek, unlike plain toUpperCase', () => {
    expect(upper('άνθρωπος', 'el')).toBe('ΑΝΘΡΩΠΟΣ');
  });

  it('expands German ß to SS', () => {
    expect(upper('straße', 'de')).toBe('STRASSE');
  });

  it('uppercases Vietnamese diacritics normally', () => {
    expect(upper('tiếng việt', 'vi')).toBe('TIẾNG VIỆT');
  });

  it('is a no-op for Japanese, Korean, Chinese and Thai, including embedded Latin text', () => {
    expect(upper('ようこそ', 'ja')).toBe('ようこそ');
    expect(upper('안녕하세요', 'ko')).toBe('안녕하세요');
    expect(upper('你好', 'zh-Hans')).toBe('你好');
    expect(upper('สวัสดี', 'th')).toBe('สวัสดี');
    expect(upper('Pass+ สวัสดี', 'th')).toBe('Pass+ สวัสดี');
  });

  it('uppercases plain English', () => {
    expect(upper('cancel', 'en')).toBe('CANCEL');
  });
});

describe('upperKeepingCurrency', () => {
  it('keeps a currency symbol next to its number or on its own as written', () => {
    expect(upperKeepingCurrency('Rp 450.000', 'en')).toBe('Rp 450.000');
    expect(upperKeepingCurrency('Rp', 'en')).toBe('Rp');
    expect(upperKeepingCurrency('total 1.080 kr', 'sv')).toBe('TOTAL 1.080 kr');
  });

  it('still uppercases the same letters inside words', () => {
    expect(upperKeepingCurrency('Rpg krill', 'en')).toBe('RPG KRILL');
    expect(upperKeepingCurrency('split it · maya paid', 'en')).toBe('SPLIT IT · MAYA PAID');
  });
});
