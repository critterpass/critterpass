import { describe, expect, it } from 'vitest';

import { androidLocaleQualifier } from '../src/native/strings-xml';
import { cfBundleLocalizations } from '../src/native/locales-config';
import { UnsupportedNativeMessageError, parseForNative } from '../src/native/message-shape';

describe('androidLocaleQualifier', () => {
  it('turns a BCP-47 tag into a b+ resource qualifier', () => {
    expect(androidLocaleQualifier('zh-Hans')).toBe('b+zh+Hans');
    expect(androidLocaleQualifier('vi')).toBe('b+vi');
  });
});

describe('locale config', () => {
  it('lists the shipped locales for CFBundleLocalizations', () => {
    expect(cfBundleLocalizations(['en', 'vi', 'th'])).toEqual(['en', 'vi', 'th']);
  });
});

describe('parseForNative rejections', () => {
  it('fails on select, naming the message id', () => {
    expect(() =>
      parseForNative(
        '{gender, select, male {He} female {She} other {They}}',
        'guide.pronoun.label',
      ),
    ).toThrow(UnsupportedNativeMessageError);
    expect(() =>
      parseForNative(
        '{gender, select, male {He} female {She} other {They}}',
        'guide.pronoun.label',
      ),
    ).toThrow(/guide\.pronoun\.label/);
  });

  it('fails on a select nested inside a plural', () => {
    expect(() =>
      parseForNative(
        '{count, plural, one {# item} other {{type, select, a {A} other {B}} items}}',
        'trip.mixedConstruct.label',
      ),
    ).toThrow(/trip\.mixedConstruct\.label/);
  });

  it('fails on more than one top-level plural', () => {
    expect(() =>
      parseForNative('{a, plural, other {#}} and {b, plural, other {#}}', 'trip.twoPlurals.label'),
    ).toThrow(/trip\.twoPlurals\.label/);
  });

  it('fails on invalid ICU syntax, naming the message id', () => {
    expect(() => parseForNative('{unterminated', 'broken.icu.label')).toThrow(/broken\.icu\.label/);
  });
});
