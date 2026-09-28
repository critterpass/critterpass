import { readFileSync } from 'node:fs';
import path from 'node:path';

import { TASTE_TAGS as DOMAIN_TASTE_TAGS, tasteFromAnswers } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { CURRENT_RELEASES, loadRelease, TASTE_TAGS } from '../src';
import blockedNames from './blocked-names.json';
import homeWords from './home-words.json';
import {
  blockedNamesFileSchema,
  homeWord,
  homeWordsFileSchema,
  ONBOARDING_QUIZ_RELEASE,
  onboardingQuiz,
  onboardingQuizItemsSchema,
  tokekLinesFileSchema,
  tokekLinesFor,
  tokekLineText,
  TOKEK_LINE_TRIGGERS,
} from './index';
import tokekLines from './tokek-lines.json';

describe('onboarding quiz', () => {
  it('is a valid taste_quiz release with six questions', () => {
    const release = loadRelease(ONBOARDING_QUIZ_RELEASE, 'taste_quiz');
    expect(onboardingQuizItemsSchema.parse(release.items)).toHaveLength(6);
    expect(onboardingQuiz().map((q) => q.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps the designed SUNRISE SUMMIT vs SLEEP TILL TEN question', () => {
    const labels = onboardingQuiz().map((q) => `${q.left.label} / ${q.right.label}`);
    expect(labels).toContain('SUNRISE SUMMIT / SLEEP TILL TEN');
  });

  it('matches the committed factory batch, and a pulled release once one exists', () => {
    const batch = JSON.parse(
      readFileSync(
        path.resolve(
          import.meta.dirname,
          '../../../tools/content-factory/batches/taste_quiz/2026-09-28-taste-quiz-01.json',
        ),
        'utf8',
      ),
    ) as { checksum: string };
    const pulled = CURRENT_RELEASES.taste_quiz as { checksum: string } | undefined;
    const expected = pulled?.checksum ?? batch.checksum;
    expect((ONBOARDING_QUIZ_RELEASE as { checksum: string }).checksum).toBe(expected);
  });

  it('uses the same tag vocabulary as the domain taxonomy', () => {
    expect([...DOMAIN_TASTE_TAGS]).toEqual([...TASTE_TAGS]);
    const answers = onboardingQuiz().map((q) => ({ q_id: q.id, value: 'left' as const }));
    expect(tasteFromAnswers(onboardingQuiz(), answers).tags.length).toBeGreaterThan(3);
  });
});

describe('tokek lines', () => {
  it('validate, with at least twenty lines and a line for every trigger', () => {
    const file = tokekLinesFileSchema.parse(tokekLines);
    expect(file.lines.length).toBeGreaterThanOrEqual(20);
    for (const trigger of TOKEK_LINE_TRIGGERS)
      expect(tokekLinesFor(trigger).length).toBeGreaterThan(0);
    expect(new Set(file.lines.map((l) => l.id)).size).toBe(file.lines.length);
  });

  it('falls back to English', () => {
    const [line] = tokekLinesFor('intro');
    expect(tokekLineText(line!, 'vi-VN')).toMatch(/Tokek/u);
    expect(tokekLineText(line!, 'ko')).toBe(line!.en);
  });
});

describe('home words and blocked names', () => {
  it('validate', () => {
    homeWordsFileSchema.parse(homeWords);
    blockedNamesFileSchema.parse(blockedNames);
    expect(homeWord('MY')).toBe('RUMAH');
    expect(homeWord('AQ')).toBe('HOME');
    expect(homeWord(null)).toBe('HOME');
  });
});
