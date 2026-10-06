import { describe, expect, it } from 'vitest';

import { dueLabel } from './work-data';

describe('dueLabel', () => {
  const now = new Date('2026-10-06T08:00:00Z');
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

  it('says how late an overdue item is', () => {
    expect(dueLabel(at(-125), now)).toBe('2 h 5 min late');
    expect(dueLabel(at(-9), now)).toBe('9 min late');
  });

  it('counts down within two hours', () => {
    expect(dueLabel(at(38), now)).toBe('due 38 min');
    expect(dueLabel(at(112), now)).toBe('due 1 h 52 min');
  });

  it('names the day and time beyond two hours, and says when there is no due time', () => {
    expect(dueLabel(at(60 * 26), now)).toMatch(/^[A-Z][a-z]{2} \d{2}:\d{2}$/);
    expect(dueLabel(null, now)).toBe('no due time');
  });
});
