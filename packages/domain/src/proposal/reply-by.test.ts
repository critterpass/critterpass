import { describe, expect, it } from 'vitest';

import { defaultReplyBy, validateReplyBy } from './reply-by';

const now = new Date('2026-10-01T00:00:00Z');
const at = (iso: string) => new Date(iso);

describe('defaultReplyBy', () => {
  it('takes a day before the earliest free cancellation when that comes first', () => {
    const replyBy = defaultReplyBy({
      freeCancelDeadlines: [at('2026-10-20T00:00:00Z'), at('2026-10-10T12:00:00Z')],
      tripStart: at('2026-11-15T00:00:00Z'),
      now,
    });
    expect(replyBy?.toISOString()).toBe('2026-10-09T12:00:00.000Z');
  });

  it('takes two weeks before the trip when no stay is booked', () => {
    const replyBy = defaultReplyBy({
      freeCancelDeadlines: [],
      tripStart: at('2026-11-15T00:00:00Z'),
      now,
    });
    expect(replyBy?.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('never lands in the past: an hour before the nearer bound once the margin is gone', () => {
    const replyBy = defaultReplyBy({
      freeCancelDeadlines: [at('2026-10-01T12:00:00Z')],
      tripStart: at('2026-10-05T00:00:00Z'),
      now,
    });
    expect(replyBy?.toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(replyBy!.getTime()).toBeGreaterThan(now.getTime());
  });

  it('gives no default when every bound has passed', () => {
    expect(
      defaultReplyBy({ freeCancelDeadlines: [at('2026-09-30T00:00:00Z')], tripStart: null, now }),
    ).toBeNull();
  });

  it('gives a week when nothing bounds it', () => {
    expect(defaultReplyBy({ freeCancelDeadlines: [], tripStart: null, now })?.toISOString()).toBe(
      '2026-10-08T00:00:00.000Z',
    );
  });
});

describe('validateReplyBy', () => {
  const inputs = { freeCancelDeadlines: [at('2026-10-10T00:00:00Z')], now };

  it('rejects a deadline after the earliest free cancellation', () => {
    expect(validateReplyBy(at('2026-10-11T00:00:00Z'), inputs)).toEqual({
      ok: false,
      reason: 'after_free_cancel',
      deadline: '2026-10-10T00:00:00.000Z',
    });
  });

  it('rejects a deadline in the past', () => {
    expect(validateReplyBy(at('2026-09-30T00:00:00Z'), inputs)).toEqual({
      ok: false,
      reason: 'in_past',
    });
  });

  it('accepts a deadline inside both bounds', () => {
    expect(validateReplyBy(at('2026-10-09T00:00:00Z'), inputs)).toEqual({ ok: true });
  });
});
