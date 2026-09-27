import { describe, expect, it } from 'vitest';

import { checkIcuSyntax } from './icu-check.js';

describe('checkIcuSyntax', () => {
  it('accepts plain text with no placeholders', () => {
    expect(checkIcuSyntax('Try again')).toBeNull();
  });

  it('accepts a simple placeholder', () => {
    expect(checkIcuSyntax('Build variant: {variant}')).toBeNull();
  });

  it('accepts a plural construct', () => {
    expect(checkIcuSyntax('{count, plural, one {# item} other {# items}}')).toBeNull();
  });

  it('accepts a select construct', () => {
    expect(checkIcuSyntax('{gender, select, male {He} female {She} other {They}}')).toBeNull();
  });

  it('flags a missing closing brace', () => {
    expect(checkIcuSyntax('{count, plural, other {# items}')).toMatch(/unbalanced braces/);
  });

  it('flags an extra closing brace', () => {
    expect(checkIcuSyntax('Try again}')).toMatch(/unmatched closing/);
  });

  it('flags an unrecognised argument type', () => {
    expect(checkIcuSyntax('{count, counted, other {# items}}')).toMatch(/unrecognised ICU argument type "counted"/);
  });
});
