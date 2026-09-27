import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import '../src/kinds/phrases';
import { phraseLanguages, toCards } from '../src/kinds/phrases/generate';
import { phrasesKind } from '../src/kinds/phrases';
import { audioKey, synthesise, ttsConfigFromEnv } from '../src/kinds/phrases/tts';
import { phraseValidators } from '../src/kinds/phrases/validate';
import { validateCommitted } from '../src/pipeline';
import { runValidators } from '../src/validators/registry';

const cards = toCards('ja', {
  cards: [
    {
      context: 'food',
      slug: 'english-menu',
      text: '英語のメニューはありますか？',
      romanisation: 'eigo no menyuu wa arimasu ka?',
      gloss: 'Do you have an English menu?',
    },
    {
      context: 'emergency',
      slug: 'need-a-doctor',
      text: '医者が必要です',
      romanisation: 'isha ga hitsuyou desu',
      gloss: 'I need a doctor.',
    },
    {
      context: 'food',
      slug: 'bill',
      text: 'the bill',
      romanisation: null,
      gloss: 'The bill, please.',
    },
  ],
});

describe('phrase cards', () => {
  it('cover one primary language per destination', () => {
    const languages = phraseLanguages().map((l) => l.language);
    expect(new Set(languages).size).toBe(languages.length);
    expect(languages).toEqual(expect.arrayContaining(['vi', 'ja', 'id', 'is', 'pt-PT', 'es']));
  });

  it('check the script and flag emergency cards for native review', () => {
    const report = runValidators('phrases', cards, phraseValidators);
    const byRef = new Map(report.items.map((item) => [item.ref, item]));
    expect(byRef.get('ja:food:english-menu')?.severity).toBe('warn');
    expect(byRef.get('ja:food:bill')?.checks.map((c) => c.id)).toContain('script');
    expect(cards.find((c) => c.context === 'emergency')?.needs_native_review).toBe(true);
    expect(phrasesKind.blockedReason?.(cards)).toBe(
      '1 emergency or allergy cards need a native speaker',
    );
  });

  it('stay text-only with audio pending until TTS is configured', async () => {
    expect(ttsConfigFromEnv({})).toBeNull();
    expect((await synthesise(cards, null)).every((c) => c.audio_status === 'pending')).toBe(true);
    expect(audioKey(cards[0]!, 'voice-a')).toBe(audioKey(cards[0]!, 'voice-a'));
    expect(audioKey(cards[0]!, 'voice-a')).not.toBe(audioKey(cards[0]!, 'voice-b'));
  });

  it('commit every language with every context, emergency cards held apart', () => {
    const committed = committedItems('phrases');
    for (const { language } of phraseLanguages()) {
      const contexts = new Set(
        committed.filter((c) => c.language === language).map((c) => c.context),
      );
      expect(contexts.size, language).toBe(7);
    }
    for (const { report } of validateCommitted('phrases')) expect(report.severity).not.toBe('fail');
  });
});
