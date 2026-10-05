/**
 * A plan change's chat line carries what was decided as one short body the app reads back: the
 * place, its day and its time for a single change, and nothing for several.
 */
import { describe, expect, it } from 'vitest';

import { parsePlanChangeLineBody, planChangeLineBody } from './inbox-kinds';

const one = { op: 'add', title: 'Bà Nà Hills', date: '2026-10-21', time: '07:00', count: 1 };

describe('a plan change in one line', () => {
  it('names the place, the day and the time, and reads them back', () => {
    const body = planChangeLineBody(one);
    expect(body).toBe('Bà Nà Hills · 2026-10-21 07:00');
    expect(parsePlanChangeLineBody(body)).toEqual({
      title: 'Bà Nà Hills',
      date: '2026-10-21',
      time: '07:00',
    });
  });

  it('keeps what it knows when the day or the time is missing', () => {
    const noTime = planChangeLineBody({ ...one, time: null });
    expect(parsePlanChangeLineBody(noTime)).toEqual({
      title: 'Bà Nà Hills',
      date: '2026-10-21',
      time: null,
    });
    const bare = planChangeLineBody({ ...one, date: null, time: null });
    expect(parsePlanChangeLineBody(bare)).toEqual({ title: 'Bà Nà Hills', date: null, time: null });
    // A name with the separator in it stays whole.
    expect(parsePlanChangeLineBody('Chả Bò · Bà Quýt · 2026-10-21 10:00')?.title).toBe(
      'Chả Bò · Bà Quýt',
    );
  });

  it('says nothing for several changes or a stop with no name', () => {
    expect(planChangeLineBody({ ...one, count: 3 })).toBe('');
    expect(planChangeLineBody({ ...one, title: '' })).toBe('');
    expect(parsePlanChangeLineBody('')).toBeNull();
  });
});
