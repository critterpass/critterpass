import { describe, expect, it } from '@jest/globals';

import { atNameLimit, nameSuggestions } from '../name-suggestions';

describe('name suggestions at the limit', () => {
  it('offers the first word, then the first word and the last initial', () => {
    expect(nameSuggestions('Winston Alexander Montgomery')).toEqual(['Winston', 'Winston M.']);
  });

  it('offers nothing for a single word', () => {
    expect(nameSuggestions('Bartholomewbartholomewba')).toEqual([]);
  });

  it('counts letters as people see them, not code units', () => {
    expect(atNameLimit('é'.repeat(24))).toBe(true);
    expect(atNameLimit('é'.repeat(23))).toBe(false);
  });
});
