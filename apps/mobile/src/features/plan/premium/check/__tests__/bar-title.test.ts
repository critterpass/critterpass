import { describe, expect, it } from '@jest/globals';

import { barTitle } from '../bar-title';

describe('barTitle', () => {
  it('turns a stacked capitals heading into one sentence-case line', () => {
    expect(barTitle('CHECKING\nTHE PLAN', 'en')).toBe('Checking the plan');
    expect(barTitle('2 TO FIX,\n1 TO KNOW', 'en')).toBe('2 to fix, 1 to know');
    expect(barTitle('CHECKING…', 'en')).toBe('Checking…');
  });

  it('keeps a mixed-case heading as written, on one line', () => {
    expect(barTitle('Whose picks\nmade it', 'en')).toBe('Whose picks made it');
    expect(barTitle('Ai đã chọn gì', 'vi')).toBe('Ai đã chọn gì');
  });

  it('lowercases by the language’s own rules', () => {
    expect(barTitle('KIỂM TRA\nKẾ HOẠCH', 'vi')).toBe('Kiểm tra kế hoạch');
  });
});
