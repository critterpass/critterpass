import { describe, expect, it } from 'vitest';

import { adminCountsSchema, bucketWork, countTone } from './work';

const now = new Date('2026-09-28T03:00:00Z');
const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();

describe('work buckets', () => {
  it('splits items by urgency, soonest first, undated last', () => {
    const items = [
      { id: 'later', due_at: at(300) },
      { id: 'undated', due_at: null },
      { id: 'soon', due_at: at(90) },
      { id: 'late', due_at: at(-5) },
      { id: 'oldest', due_at: at(-60) },
    ];
    const buckets = bucketWork(items, now);
    expect(buckets.overdue.map((item) => item.id)).toEqual(['oldest', 'late']);
    expect(buckets.due_soon.map((item) => item.id)).toEqual(['soon']);
    expect(buckets.later.map((item) => item.id)).toEqual(['later', 'undated']);
  });

  it('turns a badge urgent, warn or plain', () => {
    expect(countTone([{ due_at: at(-1) }, { due_at: at(30) }], now)).toEqual({
      count: 2,
      tone: 'urgent',
    });
    expect(countTone([{ due_at: at(30) }], now).tone).toBe('warn');
    expect(countTone([{ due_at: null }], now).tone).toBe('plain');
    expect(countTone([], now)).toEqual({ count: 0, tone: 'plain' });
  });

  it('accepts counts for known areas only', () => {
    expect(adminCountsSchema.safeParse({ moderation: { count: 1, tone: 'warn' } }).success).toBe(
      true,
    );
    expect(adminCountsSchema.safeParse({ nowhere: { count: 1, tone: 'warn' } }).success).toBe(
      false,
    );
  });
});
