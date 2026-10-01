/** The small lines that change with the number or the language: stat labels and stamp months. */
import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { statLabel, stampMonth } from '../profile-copy';

describe('profile copy', () => {
  it('names one of a thing in the singular', () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    expect(statLabel('countries', 1)).toBe('Country');
    expect(statLabel('countries', 0)).toBe('Countries');
    expect(statLabel('trips', 1)).toBe('Trip');
    expect(statLabel('critters', 12)).toBe('Critters');
  });

  it('prints a stamp month short, and in numbers where the short month runs long', () => {
    expect(stampMonth('2024-06-03', 'en')).toBe('Jun 2024');
    expect(stampMonth('2024-06-03', 'vi')).toBe('6/2024');
    expect(stampMonth('2023-10-21', 'vi')).toBe('10/2023');
  });
});
