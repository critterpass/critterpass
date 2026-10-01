import { describe, expect, it } from 'vitest';

import {
  guideText,
  guideTextIsCurrent,
  guideTextLimit,
  guideTextLocales,
  guideTextSourceHash,
  GUIDE_TEXT_FIELDS,
  pitchGuideTextSource,
} from './guide-text';

const NOTE = 'Dragon Bridge breathes fire at 21:00 on weekends.';
const VI = 'Dragon Bridge phun lửa lúc 21:00 cuối tuần.';

function translated(source: { notes: string }, fields: Record<string, unknown>) {
  return { _src: guideTextSourceHash('plan_item', source), ...fields };
}

describe('guideText', () => {
  const source = { notes: NOTE };
  const i18n = translated(source, { vi: { notes: VI } });

  it('reads the translation in a language that has a current one', () => {
    expect(guideText('plan_item', source, i18n, 'notes', 'vi')).toBe(VI);
  });

  it('reads the source text in English, whatever translations exist', () => {
    expect(guideText('plan_item', source, i18n, 'notes', 'en')).toBe(NOTE);
  });

  it('reads the source text when nothing was translated, or not into this language', () => {
    expect(guideText('plan_item', source, null, 'notes', 'vi')).toBe(NOTE);
    expect(guideText('plan_item', source, undefined, 'notes', 'vi')).toBe(NOTE);
    expect(guideText('plan_item', source, i18n, 'notes', 'ja')).toBe(NOTE);
  });

  it('reads the text as typed once someone has edited it', () => {
    const edited = { notes: 'Skip the bridge, meet at the night market instead.' };
    expect(guideText('plan_item', edited, i18n, 'notes', 'vi')).toBe(edited.notes);
    expect(guideTextIsCurrent('plan_item', edited, i18n)).toBe(false);
    expect(guideTextLocales('plan_item', edited, i18n)).toEqual([]);
  });

  it('accepts the column as the phone holds it (JSON text) and survives a broken value', () => {
    expect(guideText('plan_item', source, JSON.stringify(i18n), 'notes', 'vi')).toBe(VI);
    expect(guideText('plan_item', source, '{"vi":', 'notes', 'vi')).toBe(NOTE);
    expect(guideText('plan_item', source, '[]', 'notes', 'vi')).toBe(NOTE);
  });

  it('keeps the source for a line that could not be translated within the rules', () => {
    const quest = { title: 'Bridge watchers', body: 'Get everyone to Dragon Bridge by 21:00.' };
    const stored = {
      _src: guideTextSourceHash('quest', quest),
      vi: { title: null, body: 'Đưa cả nhóm tới Dragon Bridge trước 21:00.' },
    };
    expect(guideText('quest', quest, stored, 'title', 'vi')).toBe('Bridge watchers');
    expect(guideText('quest', quest, stored, 'body', 'vi')).toBe(
      'Đưa cả nhóm tới Dragon Bridge trước 21:00.',
    );
    // Tried and settled: the sweep does not ask for this language again.
    expect(guideTextLocales('quest', quest, stored)).toEqual(['vi']);
  });

  it('has nothing to say for a row without text', () => {
    expect(guideText('plan_item', { notes: null }, i18n, 'notes', 'vi')).toBeNull();
  });
});

describe('guideTextSourceHash', () => {
  it('covers every text field of the kind, so a change to any one makes the row stale', () => {
    const quest = { title: 'Bridge watchers', body: 'Be at Dragon Bridge by 21:00.' };
    const hash = guideTextSourceHash('quest', quest);
    expect(guideTextSourceHash('quest', { ...quest })).toBe(hash);
    expect(guideTextSourceHash('quest', { ...quest, title: 'Bridge watcher' })).not.toBe(hash);
    expect(guideTextSourceHash('quest', { ...quest, body: `${quest.body} ` })).not.toBe(hash);
    // Other columns of the row are not part of it.
    expect(guideTextSourceHash('quest', { ...quest, status: 'active' })).toBe(hash);
  });

  it('is the value already stored next to translations: it must never change', () => {
    expect(guideTextSourceHash('plan_item', { notes: NOTE })).toBe('21rvwt75z0n');
    expect(guideTextSourceHash('plan_day', { theme: 'Up Ba Na Hills, early' })).toBe('2qejuaplft');
  });
});

describe('guideTextLimit', () => {
  const [title] = GUIDE_TEXT_FIELDS.quest;

  it('lets a short title use the field, and a long one grow by two fifths at most', () => {
    expect(guideTextLimit(title, 'Bridge fans')).toBe(24);
    expect(guideTextLimit(title, 'Bridge watchers at night')).toBe(34);
  });
});

describe('pitchGuideTextSource', () => {
  it("reads the pitch's lines out of its sections", () => {
    expect(
      pitchGuideTextSource({
        headline: 'Da Nang in March',
        reasons: [{ text: 'Dry season' }, { text: 'Cheap flights' }],
        quote: null,
      }),
    ).toEqual({
      headline: 'Da Nang in March',
      reason_0: 'Dry season',
      reason_1: 'Cheap flights',
      reason_2: null,
      quote: null,
    });
  });
});
