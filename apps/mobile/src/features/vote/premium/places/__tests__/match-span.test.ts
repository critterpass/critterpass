import { describe, expect, it } from '@jest/globals';

import { matchSpan } from '../match-span';

const bold = (name: string, typed: string) => {
  const span = matchSpan(name, typed);
  return span === null ? null : name.slice(span.start, span.end);
};

describe('the bold part of a place search row', () => {
  it('finds the typed words anywhere in the name, whatever the case', () => {
    expect(bold('Bali', 'bali')).toBe('Bali');
    expect(bold('Fes el Bali', 'Bali')).toBe('Bali');
    expect(bold('Bandar-e Anzali', 'bali')).toBeNull();
  });

  it('reads past accents and dotless letters', () => {
    expect(bold('Balıkesir', 'bali')).toBe('Balı');
    expect(bold('Đà Lạt', 'da lat')).toBe('Đà Lạt');
    expect(bold('Hội An', 'hoi')).toBe('Hội');
  });

  it('bolds nothing for an empty query', () => {
    expect(matchSpan('Bali', '  ')).toBeNull();
  });
});
