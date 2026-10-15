import { describe, expect, it } from '@jest/globals';

import { EMPTY_PROFILE } from '../dietary-data';
import { sameProfile } from '../use-dietary-form';

describe('dietary form changes', () => {
  const loaded = {
    ...EMPTY_PROFILE,
    diet: 'vegetarian',
    allergies: ['peanut', 'shellfish'],
    accessibility_notes: null,
  } as const;

  it('reads an untouched form, chips tapped back in another order, or a cleared note as unchanged', () => {
    expect(sameProfile(loaded, { ...loaded })).toBe(true);
    expect(sameProfile(loaded, { ...loaded, allergies: ['shellfish', 'peanut'] })).toBe(true);
    expect(sameProfile(loaded, { ...loaded, accessibility_notes: '  ' })).toBe(true);
  });

  it('reads a real edit as a change', () => {
    expect(sameProfile(loaded, { ...loaded, allergies: ['peanut'] })).toBe(false);
    expect(sameProfile(loaded, { ...loaded, spice: 'mild' })).toBe(false);
    expect(sameProfile(loaded, { ...loaded, visibility: 'crew_flags' })).toBe(false);
    expect(sameProfile(loaded, { ...loaded, accessibility_notes: 'Step-free rooms' })).toBe(false);
  });
});
