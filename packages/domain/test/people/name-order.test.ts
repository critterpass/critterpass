import { describe, expect, it } from 'vitest';

import { calledByName } from '../../src/people/name-order';

describe('calledByName', () => {
  it('takes the given name of a family-name-first Vietnamese name', () => {
    expect(calledByName('Đặng Thị Ngọc Hân')).toBe('Hân');
    expect(calledByName('Nguyen Van An')).toBe('An');
  });

  it('takes the first word of a Western name, and of a Vietnamese name written Western way round', () => {
    expect(calledByName('Maya Tan')).toBe('Maya');
    expect(calledByName('Hân Đặng')).toBe('Hân');
  });

  it('keeps a one-word name and has nothing for a name without letters', () => {
    expect(calledByName('  Bình ')).toBe('Bình');
    expect(calledByName('🌴')).toBeNull();
    expect(calledByName('')).toBeNull();
  });
});
