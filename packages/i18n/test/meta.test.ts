import { describe, expect, it } from 'vitest';

import { localeMeta } from '../src/meta';

describe('localeMeta', () => {
  it('returns BCP-47, names, script and direction for a registered locale', () => {
    expect(localeMeta('vi')).toEqual({
      bcp47: 'vi',
      englishName: 'Vietnamese',
      nativeName: 'Tiếng Việt',
      script: 'Latn',
      direction: 'ltr',
    });
  });

  it('falls back to the source locale for an unregistered code', () => {
    expect(localeMeta('xx-XX').bcp47).toBe('en');
  });
});
