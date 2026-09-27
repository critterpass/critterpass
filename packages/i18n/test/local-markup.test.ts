import { describe, expect, it } from 'vitest';

import { parseLocalMarkup } from '../src/local-markup';

describe('parseLocalMarkup', () => {
  it('returns a single untagged span for plain text', () => {
    expect(parseLocalMarkup('Nothing here yet.')).toEqual([{ text: 'Nothing here yet.' }]);
  });

  it('splits surrounding text from a local-language span', () => {
    expect(parseLocalMarkup('Say <local lang="id">terima kasih</local> to thank them.')).toEqual([
      { text: 'Say ' },
      { text: 'terima kasih', lang: 'id' },
      { text: ' to thank them.' },
    ]);
  });

  it('handles a local span with nothing before or after it', () => {
    expect(parseLocalMarkup('<local lang="id">Terima kasih</local>')).toEqual([
      { text: 'Terima kasih', lang: 'id' },
    ]);
  });

  it('handles more than one local span in the same message', () => {
    expect(
      parseLocalMarkup(
        '<local lang="id">Selamat pagi</local>, then <local lang="id">terima kasih</local>.',
      ),
    ).toEqual([
      { text: 'Selamat pagi', lang: 'id' },
      { text: ', then ' },
      { text: 'terima kasih', lang: 'id' },
      { text: '.' },
    ]);
  });

  it('returns an empty array for an empty message', () => {
    expect(parseLocalMarkup('')).toEqual([]);
  });
});
