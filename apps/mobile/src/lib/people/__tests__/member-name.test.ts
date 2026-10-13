/**
 * A member's name: never a blank (an erased account reads "Former member"), and the short name a
 * person is called by respects the order their name is written in.
 */
import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import {
  formerMemberLabel,
  isFormerMember,
  memberFirstName,
  memberName,
  shortName,
} from '../member-name';

i18n.loadAndActivate({ locale: 'en', messages: {} });

describe('member names', () => {
  it('reads "Former member" for a name that is gone', () => {
    for (const gone of [null, undefined, '', '   ']) {
      expect(memberName(gone)).toBe('Former member');
      expect(memberFirstName(gone)).toBe('Former member');
      expect(shortName(gone)).toBe('Former member');
      expect(isFormerMember(gone)).toBe(true);
    }
    expect(isFormerMember(formerMemberLabel())).toBe(true);
  });

  it('keeps a real full name', () => {
    expect(memberName('  Maya Tan ')).toBe('Maya Tan');
    expect(isFormerMember('Maya')).toBe(false);
  });
});

describe('shortName', () => {
  it('calls a Vietnamese name by its given name, with or without diacritics', () => {
    expect(shortName('Đặng Thị Ngọc Hân')).toBe('Hân');
    expect(shortName('Dang Thi Ngoc Han')).toBe('Han');
    expect(shortName('Nguyễn Văn An')).toBe('An');
    expect(shortName('Nguyen Minh')).toBe('Minh');
    expect(shortName('Trần Quốc Khánh')).toBe('Khánh');
    expect(shortName('Lê Văn Minh')).toBe('Minh');
    expect(shortName('Le Thi Thu')).toBe('Thu');
    expect(shortName('Hồ Ngọc Hà')).toBe('Hà');
    expect(memberFirstName('Phạm Thu Trang')).toBe('Trang');
  });

  it('keeps a Vietnamese name written Western way round', () => {
    expect(shortName('Hân Đặng')).toBe('Hân');
    expect(shortName('Khanh Nguyen')).toBe('Khanh');
  });

  it('calls a Western name by its first name', () => {
    expect(shortName('Maya Tan')).toBe('Maya');
    expect(shortName('Aleksandra Wiśniewska-Kowalczyk')).toBe('Aleksandra');
    expect(shortName('José García')).toBe('José');
    expect(shortName('Mai Phillips')).toBe('Mai');
    expect(shortName('Kim Kardashian')).toBe('Kim');
    expect(shortName('Ly Smith')).toBe('Ly');
  });

  it('reads family name first in Han, Hangul and kana when the parts are spaced', () => {
    expect(shortName('山田 太郎')).toBe('太郎');
    expect(shortName('김 민준')).toBe('민준');
    expect(shortName('王小明')).toBe('王小明');
  });

  it('keeps a one-word name whole', () => {
    expect(shortName('Pon')).toBe('Pon');
    expect(shortName('  Hân ')).toBe('Hân');
  });

  it('skips emoji beside a name, and keeps an emoji-only name', () => {
    expect(shortName('🌴 Maya Tan')).toBe('Maya');
    expect(shortName('Đặng Ngọc Hân 🦊')).toBe('Hân');
    expect(shortName('🦊')).toBe('🦊');
  });

  it('prefers a stored given name', () => {
    expect(shortName('Đặng Thị Ngọc Hân', { givenName: 'Ngọc Hân' })).toBe('Ngọc Hân');
    expect(shortName('Maya Tan', { givenName: '  ' })).toBe('Maya');
  });
});
