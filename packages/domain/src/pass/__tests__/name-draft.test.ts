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
    draft = advanceDraft(draft, 'name');
    expect(draft.step).toBe('photo');
    expect(advanceDraft(draft, 'photo').step).toBe('photo');
    draft = advanceDraft(
      { ...draft, avatar: { kind: 'critter', form_id: 'guide:tokek' } },
      'photo',
    );
    expect(draft.step).toBe('taste');
    draft = advanceDraft({ ...draft, taste_done: true }, 'taste');
    draft = advanceDraft({ ...draft, home_iata: 'SIN' }, 'home');
    expect(draft.step).toBe('issued');
    expect(backDraft(draft).step).toBe('issued');
    draft = advanceDraft({ ...draft, issued_at: '2026-09-26T08:00:00.000Z' }, 'issued');
    expect(draft.step).toBe('saved');
  });

  it('blocks a blocked name from advancing', () => {
    expect(
      advanceDraft({ ...newPassDraft(ID), given_name: 'badword' }, 'name', ['badword']).step,
    ).toBe('name');
  });

  it('advances from the page it is asked from, not from where the draft was stored', () => {
    const issued: PassDraft = {
      ...named(),
      avatar: { kind: 'critter', form_id: 'guide:tokek' },
      taste_done: true,
      home_iata: 'SIN',
      issued_at: '2026-09-26T08:00:00.000Z',
      step: 'issued',
    };
    // Home's own "next" on an issued pass leads to the issued page again, never past saving.
    expect(advanceDraft({ ...issued, home_iata: 'DAD' }, 'home').step).toBe('issued');
    expect(advanceDraft({ ...issued, step: 'saved' }, 'home').step).toBe('issued');
    // An earlier page leads to the page after it.
    expect(advanceDraft({ ...issued, step: 'home' }, 'name').step).toBe('photo');
    // A page whose own data is missing keeps the draft on it.
    expect(advanceDraft({ ...issued, step: 'home', given_name: ' ' }, 'name').step).toBe('name');
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
