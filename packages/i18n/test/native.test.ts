import { describe, expect, it } from 'vitest';

import { androidLocaleQualifier, generateStringsXml } from '../src/native/strings-xml';
import { generateXcstrings } from '../src/native/xcstrings';
import { cfBundleLocalizations, generateAndroidLocalesConfig } from '../src/native/locales-config';
import { UnsupportedNativeMessageError, parseForNative } from '../src/native/message-shape';

// One plain message and one plural message, translated into a locale that keeps the same argument
// order (vi) and one that also only has an "other" plural category (ja) — real shapes the surfaces
// catalog's own messages will take.
const sourceLocale = 'en';
const messagesByLocale = {
  en: {
    'crew.chatNotification.title': '{sender} sent a message',
    'trip.itemCount.label': '{count, plural, one {# item} other {# items}}',
  },
  vi: {
    'crew.chatNotification.title': '{sender} đã gửi một tin nhắn',
    'trip.itemCount.label': '{count, plural, other {# mục}}',
  },
  ja: {
    'crew.chatNotification.title': '{sender}さんがメッセージを送信しました',
    'trip.itemCount.label': '{count, plural, other {#件}}',
  },
};

describe('generateXcstrings', () => {
  it('matches the golden .xcstrings for en, vi and ja', () => {
    expect(generateXcstrings({ sourceLocale, messagesByLocale })).toMatchSnapshot();
  });
});

describe('generateStringsXml', () => {
  it.each(['en', 'vi', 'ja'] as const)('matches the golden strings.xml for %s', (locale) => {
    expect(
      generateStringsXml({
        locale,
        messages: messagesByLocale[locale],
        sourceMessages: messagesByLocale[sourceLocale],
      }),
    ).toMatchSnapshot();
  });
});

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

  it('matches the golden Android locales_config.xml', () => {
    expect(generateAndroidLocalesConfig(['en', 'vi', 'th'])).toMatchSnapshot();
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
