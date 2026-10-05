/**
 * The version writer is told when each stop happens, so its words can fit the hour, and whether
 * the reader ever said what they want, so it never claims they picked something they did not.
 */
import { describe, expect, it } from 'vitest';

import { buildVersionRequest, partOfDay, type VersionContext } from '../src';

const context: VersionContext = {
  guide: 'chava',
  recipientFirstName: 'Minh',
  destination: 'Da Nang',
  dates: '2026-10-19 to 2026-10-21',
  tasteTags: [],
  items: [
    {
      id: 'a',
      title: 'Bãi biển Phạm Văn Đồng',
      day: 1,
      category: 'sight',
      must_do: false,
      time: '14:00',
    },
    { id: 'b', title: 'Mỳ Quảng Cô Sáu', day: 1, category: 'food', must_do: false },
  ],
  share: null,
  savings: [],
  otherNames: ['Linh'],
};

function planSent(input: VersionContext): {
  asked_for_something: boolean;
  plan: { id: string; time: string | null; part_of_day: string | null }[];
} {
  const request = buildVersionRequest(input);
  const turn = JSON.stringify(request.messages);
  const start = turn.indexOf('{\\"for\\"');
  const json = JSON.parse(`"${turn.slice(start, turn.indexOf('}]}', start) + 3)}"`) as string;
  return JSON.parse(json) as ReturnType<typeof planSent>;
}

describe('what the version writer knows about time', () => {
  it('names the part of the day from the stop’s own clock', () => {
    expect(partOfDay('05:00')).toBe('morning');
    expect(partOfDay('10:59')).toBe('morning');
    expect(partOfDay('11:00')).toBe('midday');
    expect(partOfDay('14:00')).toBe('afternoon');
    expect(partOfDay('18:00')).toBe('evening');
    expect(partOfDay('22:00')).toBe('night');
    expect(partOfDay('04:59')).toBe('night');
    expect(partOfDay(null)).toBeNull();
    expect(partOfDay(undefined)).toBeNull();
  });

  it('sends each stop’s time and part of day, and nothing for a stop without one', () => {
    const sent = planSent(context);
    expect(sent.plan).toMatchObject([
      { id: 'a', time: '14:00', part_of_day: 'afternoon' },
      { id: 'b', time: null, part_of_day: null },
    ]);
  });

  it('says whether the reader asked for anything', () => {
    expect(planSent(context).asked_for_something).toBe(false);
    expect(planSent({ ...context, tasteTags: ['street_food'] }).asked_for_something).toBe(true);
    const mustDo = context.items.map((item, i) => (i === 1 ? { ...item, must_do: true } : item));
    expect(planSent({ ...context, items: mustDo }).asked_for_something).toBe(true);
  });
});
