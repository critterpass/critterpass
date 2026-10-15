import { describe, expect, it } from '@jest/globals';

import { languagePillText } from '../phrase-show-screen';

describe('the phrase show language pill', () => {
  it('names the language in its own words, then the app’s, never as a bare code', () => {
    expect(languagePillText('id', {})).toBe('Bahasa Indonesia');
    expect(languagePillText('vi-VN', {})).toBe('Tiếng Việt');
    expect(languagePillText('sw', { sw: 'Swahili' })).toBe('Swahili');
    expect(languagePillText('xx', {})).toBeNull();
  });
});
