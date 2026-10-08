import { describe, expect, it } from '@jest/globals';

import { choiceOnTab } from '../tab-choice';

describe('opening a tab of the avatar picker', () => {
  it('picks initials for someone wearing a critter or a photo, so DONE can save it', () => {
    expect(choiceOnTab('initials', 'guide', null)).toEqual({ kind: 'initials' });
    expect(choiceOnTab('initials', 'photo', { kind: 'form' })).toEqual({ kind: 'initials' });
  });

  it('picks nothing for someone already on initials', () => {
    expect(choiceOnTab('initials', 'initials', null)).toBeNull();
  });

  it('drops an unsaved initials pick on leaving the tab, and keeps any other pick', () => {
    expect(choiceOnTab('critter', 'guide', { kind: 'initials' })).toBeNull();
    const form = { kind: 'form' };
    expect(choiceOnTab('photo', 'guide', form)).toBe(form);
  });
});
