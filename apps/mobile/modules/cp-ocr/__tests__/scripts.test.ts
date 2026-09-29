import { describe, expect, it } from '@jest/globals';

import { languageHints, scriptOf } from '../src/scripts';

describe('language hints', () => {
  it('maps a language to the script it is written in', () => {
    expect(scriptOf('th')).toBe('thai');
    expect(scriptOf('th-TH')).toBe('thai');
    expect(scriptOf('ja')).toBe('japanese');
    expect(scriptOf('zh-Hant-TW')).toBe('chinese');
    expect(scriptOf('ko_KR')).toBe('korean');
    expect(scriptOf('hi')).toBe('devanagari');
    expect(scriptOf('vi')).toBe('latin');
    expect(scriptOf('id')).toBe('latin');
    expect(scriptOf('sr')).toBe('cyrillic');
    expect(scriptOf('sr-Latn')).toBe('latin');
  });

  it('trims, de-duplicates and keeps the caller order', () => {
    expect(languageHints([' vi ', 'th', 'VI', '', 'en_US'])).toEqual([
      { language: 'vi', script: 'latin' },
      { language: 'th', script: 'thai' },
      { language: 'en-US', script: 'latin' },
    ]);
  });
});
