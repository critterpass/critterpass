import { describe, expect, it } from 'vitest';

import {
  advanceDraft,
  backDraft,
  newPassDraft,
  parsePassDraft,
  resumeStep,
  type PassDraft,
} from '../draft-machine';
import { clipGivenName, givenNameProblem, GIVEN_NAME_MAX } from '../name';

const ID = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';

describe('given names', () => {
  it('flags empty, too long and blocked names', () => {
    expect(givenNameProblem('   ', [])).toBe('empty');
    expect(givenNameProblem('a'.repeat(GIVEN_NAME_MAX + 1), [])).toBe('too_long');
    expect(givenNameProblem('Winston', ['badword'])).toBeNull();
    expect(givenNameProblem('Mr Badword', ['badword'])).toBe('blocked');
    expect(givenNameProblem('xxBADWÖRDxx', ['badword'])).toBe('blocked');
    expect(givenNameProblem('Assan', ['ass'])).toBeNull();
  });

  it('counts graphemes, so non-Latin names get the full length', () => {
    expect(givenNameProblem('นภัสสร', [])).toBeNull();
    expect(clipGivenName('👩‍👩‍👧'.repeat(30))).toBe('👩‍👩‍👧'.repeat(GIVEN_NAME_MAX));
  });
});

describe('pass draft', () => {
  const named = (): PassDraft => ({ ...newPassDraft(ID), given_name: 'Winston' });

  it('walks name → photo → taste → home → issued → saved', () => {
    let draft = named();
    draft = advanceDraft(draft);
    expect(draft.step).toBe('photo');
    expect(advanceDraft(draft).step).toBe('photo');
    draft = advanceDraft({ ...draft, avatar: { kind: 'critter', form_id: 'guide:tokek' } });
    expect(draft.step).toBe('taste');
    draft = advanceDraft({ ...draft, taste_done: true });
    draft = advanceDraft({ ...draft, home_iata: 'SIN' });
    expect(draft.step).toBe('issued');
    expect(backDraft(draft).step).toBe('issued');
    draft = advanceDraft({ ...draft, issued_at: '2026-09-26T08:00:00.000Z' });
    expect(draft.step).toBe('saved');
  });

  it('blocks a blocked name from advancing', () => {
    expect(advanceDraft({ ...newPassDraft(ID), given_name: 'badword' }, ['badword']).step).toBe(
      'name',
    );
  });

  it('resumes at the first step with missing data', () => {
    expect(resumeStep({ ...named(), step: 'taste', avatar: null })).toBe('photo');
    expect(
      resumeStep({
        ...named(),
        step: 'home',
        avatar: { kind: 'initials' },
        taste_done: true,
      }),
    ).toBe('home');
  });

  it('round-trips through persistence and rejects junk', () => {
    const draft = named();
    expect(parsePassDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft);
    expect(parsePassDraft({ step: 'nowhere' })).toBeNull();
  });
});
