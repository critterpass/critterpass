/**
 * Phrase practice grading: what the device heard is compared in code, a match never asks the
 * model, and only a mismatch gets a tip (none when the model call fails).
 */
import { describe, expect, it } from 'vitest';

import { gradePhrase, phraseFeedback, type Gateway, type PhraseFeedbackInput } from '../src';

const input = (recognised: string): PhraseFeedbackInput => ({
  phrase: 'Terima kasih banyak',
  romanisation: null,
  gloss: 'Thank you very much',
  language: 'id',
  recognised,
  locale: 'en',
});

describe('phrase grading', () => {
  it.each([
    ['the same words', 'Terima kasih banyak', 'terima kasih banyak', 'ok'],
    ['punctuation and case aside', 'Xin chào!', 'xin chào', 'ok'],
    ['a missing word', 'Terima kasih banyak', 'terima kasih', 'retry'],
    ['a different tone mark', 'Cảm ơn', 'cam on', 'retry'],
    ['nothing heard', 'Terima kasih', '', 'retry'],
    [
      'an unspaced script, one character off in eight',
      'ありがとうございます',
      'ありがとうございまし',
      'ok',
    ],
    ['an unspaced script, mostly wrong', 'ありがとうございます', 'おはよう', 'retry'],
  ])('%s', (_label, phrase, heard, outcome) => {
    expect(gradePhrase(phrase, heard).outcome).toBe(outcome);
  });

  it('never asks the model for a match', async () => {
    const gateway: Pick<Gateway, 'callModel'> = {
      callModel: () => Promise.reject(new Error('must not be called')),
    };
    expect(await phraseFeedback(gateway, input('terima kasih banyak'))).toEqual({
      score: 100,
      outcome: 'ok',
      recognised: 'terima kasih banyak',
      tip: null,
    });
  });

  it('gives a mismatch no tip when the model call fails', async () => {
    const gateway: Pick<Gateway, 'callModel'> = {
      callModel: () => Promise.reject(new Error('upstream')),
    };
    expect(await phraseFeedback(gateway, input('terima kasi'))).toMatchObject({
      outcome: 'retry',
      tip: null,
    });
  });
});
