import { describe, expect, it } from '@jest/globals';

import type { BaseTypeStyle } from './resolve';
import { fontFor, scriptForLocale } from './resolve';

describe('scriptForLocale', () => {
  const cases: Array<[string, string]> = [
    ['en', 'latin'],
    ['id', 'latin'],
    ['es', 'latin'],
    ['pt', 'latin'],
    ['fr', 'latin'],
    ['vi', 'vietnamese'],
    ['th', 'thai'],
    ['ja', 'cjk'],
    ['zh-Hans', 'cjk'],
    ['zh-Hant', 'cjk'],
    ['ko', 'cjk'],
  ];

  it.each(cases)('maps %s to %s', (locale, script) => {
    expect(scriptForLocale(locale)).toBe(script);
  });

  it('is case-insensitive and defaults an unknown language to latin', () => {
    expect(scriptForLocale('VI')).toBe('vietnamese');
    expect(scriptForLocale('xx')).toBe('latin');
  });
});

const displayH1: BaseTypeStyle = {
  fontFamily: 'archivo',
  fontWeight: 900,
  widthStep: 70,
  lineHeightMultiplier: 0.86,
  condensed: true,
};

const bodyBase: BaseTypeStyle = {
  fontFamily: 'geist',
  fontWeight: 500,
  lineHeightMultiplier: 1.4,
  condensed: false,
};

const voiceBase: BaseTypeStyle = {
  fontFamily: 'voice',
  fontWeight: 400,
  lineHeightMultiplier: 1.1,
  condensed: false,
};

describe('fontFor — display-class Archivo variant (h1)', () => {
  it('renders Latin condensed at its designed .86 line height, no fallback', () => {
    const resolved = fontFor(displayH1, 'en');
    expect(resolved).toEqual({
      fontFamily: 'Archivo-W70-900',
      fontStyle: 'normal',
      sizeMultiplier: 1,
      lineHeightMultiplier: 0.86,
      condensedUpper: true,
    });
  });

  it('keeps Vietnamese on Archivo (full glyph coverage) but raises the line height to 1.0', () => {
    const resolved = fontFor(displayH1, 'vi');
    expect(resolved.fontFamily).toBe('Archivo-W70-900');
    expect(resolved.lineHeightMultiplier).toBe(1.0);
    expect(resolved.condensedUpper).toBe(true);
  });

  it('falls back to bundled Noto Sans Thai Black for Thai, non-condensed', () => {
    const resolved = fontFor(displayH1, 'th');
    expect(resolved).toEqual({
      fontFamily: 'NotoSansThai-900',
      fontStyle: 'normal',
      sizeMultiplier: 0.85,
      lineHeightMultiplier: 1.0,
      condensedUpper: false,
    });
  });

  it.each(['ja', 'zh-Hans', 'ko'] as const)(
    'falls back to the OS system font for %s, non-condensed',
    (locale) => {
      const resolved = fontFor(displayH1, locale);
      expect(resolved).toEqual({
        fontFamily: 'system',
        fontStyle: 'normal',
        sizeMultiplier: 0.85,
        lineHeightMultiplier: 1.15,
        condensedUpper: false,
      });
    },
  );

  it('selects the requested Archivo width step and defaults to 70 when absent', () => {
    expect(fontFor({ ...displayH1, widthStep: 62 }, 'en').fontFamily).toBe('Archivo-W62-900');
    const { widthStep: _widthStep, ...withoutWidth } = displayH1;
    expect(fontFor(withoutWidth, 'en').fontFamily).toBe('Archivo-W70-900');
  });
});

describe('fontFor — body-class Geist variant', () => {
  it('keeps Geist and its own line height for Latin and Vietnamese', () => {
    expect(fontFor(bodyBase, 'en')).toEqual({
      fontFamily: 'Geist-500',
      fontStyle: 'normal',
      sizeMultiplier: 1,
      lineHeightMultiplier: 1.4,
      condensedUpper: false,
    });
    expect(fontFor(bodyBase, 'vi').fontFamily).toBe('Geist-500');
    expect(fontFor(bodyBase, 'vi').lineHeightMultiplier).toBe(1.4);
  });

  it('falls back to bundled Noto Sans Thai Regular for Thai body text, keeping "body 1.4 all"', () => {
    const resolved = fontFor(bodyBase, 'th');
    expect(resolved.fontFamily).toBe('NotoSansThai-400');
    expect(resolved.sizeMultiplier).toBe(1);
    expect(resolved.lineHeightMultiplier).toBe(1.4);
    expect(resolved.condensedUpper).toBe(false);
  });

  it('falls back to the OS system font for CJK body text, keeping "body 1.4 all"', () => {
    const resolved = fontFor(bodyBase, 'ja');
    expect(resolved.fontFamily).toBe('system');
    expect(resolved.lineHeightMultiplier).toBe(1.4);
  });

  it('names Geist Mono without a space, matching the bundled file', () => {
    const monoBase: BaseTypeStyle = {
      fontFamily: 'geistMono',
      fontWeight: 500,
      lineHeightMultiplier: 1.4,
      condensed: false,
    };
    expect(fontFor(monoBase, 'en').fontFamily).toBe('GeistMono-500');
  });
});

describe('fontFor: guide voice', () => {
  it('renders Latin in Mynerve at the token line height', () => {
    expect(fontFor(voiceBase, 'en')).toEqual({
      fontFamily: 'Mynerve-400',
      fontStyle: 'normal',
      sizeMultiplier: 1,
      lineHeightMultiplier: 1.1,
      condensedUpper: false,
    });
  });

  it('keeps Vietnamese in Mynerve, which covers every Vietnamese letter', () => {
    expect(fontFor(voiceBase, 'vi')).toEqual(fontFor(voiceBase, 'en'));
    expect(fontFor(voiceBase, 'vi-VN').fontFamily).toBe('Mynerve-400');
  });

  it('follows the token when its line height changes', () => {
    expect(fontFor({ ...voiceBase, lineHeightMultiplier: 1.2 }, 'vi').lineHeightMultiplier).toBe(
      1.2,
    );
  });

  it('falls back to Noto Sans Thai in italic for Thai, which Mynerve lacks', () => {
    const resolved = fontFor(voiceBase, 'th');
    expect(resolved.fontFamily).toBe('NotoSansThai-400');
    expect(resolved.fontStyle).toBe('italic');
  });

  it.each(['ja', 'zh-Hans', 'ko'] as const)(
    'leaves %s to the OS face in italic (CJK is never bundled)',
    (locale) => {
      const resolved = fontFor(voiceBase, locale);
      expect(resolved.fontFamily).toBe('system');
      expect(resolved.fontStyle).toBe('italic');
    },
  );
});
