import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import '../src/kinds/personas';
import { toPersona } from '../src/kinds/personas';
import { validateCommitted } from '../src/pipeline';

const output = {
  catchphrases: [
    'One more lap of the market.',
    'Shade first, then plans.',
    'Ask me twice.',
    'Small steps.',
  ],
  local_words: [{ term: 'suksma', gloss: 'thank you (Balinese)', when: 'thanking someone' }],
  taboos: ['Never give medical advice.', 'Never invent opening hours.'],
  ai_disclosure: 'I’m an AI guide and can be wrong.',
  fixtures: [
    { prompt: 'Hi!', expect_any: ['hi'], forbid: ['visa'] },
    { prompt: 'Where now?', expect_any: ['market'], forbid: [] },
    { prompt: 'Is it safe?', expect_any: ['check'], forbid: ['guaranteed'] },
  ],
};

describe('persona packs', () => {
  it('add unvetted local words to live guides and none to the guest guide', () => {
    const tokek = toPersona('tokek', output, 'test');
    const words = tokek.pack['local_words'] as { term: string; vetted: boolean }[];
    expect(words.find((w) => w.term === 'suksma')?.vetted).toBe(false);
    expect(toPersona('guest', output, 'test').pack['local_words']).toEqual([]);
  });

  it('commit seven packs that validate', () => {
    expect(
      committedItems('personas')
        .map((p) => p.id)
        .sort(),
    ).toEqual(['ajo', 'guest', 'lundi', 'paco', 'pon', 'sardi', 'tokek']);
    for (const { report } of validateCommitted('personas'))
      expect(report.severity).not.toBe('fail');
  });
});
