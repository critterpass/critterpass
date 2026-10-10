import { describe, expect, it } from '@jest/globals';

import { budgetUsed, localDateOf, pingStatus, todayPings, type PingRow } from '../todays-pings';

const row = (fields: Partial<PingRow> & Pick<PingRow, 'id' | 'state'>): PingRow => ({
  category: 'crew_chat',
  class: 'budgeted',
  title: 'Maya',
  body: 'Dinner at 7?',
  is_private: 0,
  deep_link: null,
  not_before: null,
  sent_at: null,
  created_at: '2026-10-12T10:00:00Z',
  ...fields,
});

describe("today's pushes", () => {
  it('reads each state the worker writes', () => {
    expect(pingStatus({ state: 'sent', not_before: null })).toBe('sent');
    expect(pingStatus({ state: 'queued', not_before: '2026-10-13T00:00:00Z' })).toBe('held');
    expect(pingStatus({ state: 'queued', not_before: null })).toBe('sending');
    expect(pingStatus({ state: 'rolled_into_roundup', not_before: null })).toBe('roundup');
  });

  it('lists sent and held pushes, never a dropped one, and hides text when asked', () => {
    const list = todayPings(
      [
        row({ id: 'a', state: 'sent', sent_at: '2026-10-12T10:01:00Z' }),
        row({ id: 'b', state: 'queued', not_before: '2026-10-13T00:00:00Z', class: 'always' }),
        row({ id: 'c', state: 'dropped' }),
        row({ id: 'd', state: 'sent', is_private: 1 }),
      ],
      false,
    );
    expect(list.map((ping) => [ping.id, ping.status, ping.at, ping.always])).toEqual([
      ['a', 'sent', '2026-10-12T10:01:00Z', false],
      ['b', 'held', '2026-10-13T00:00:00Z', true],
      ['d', 'sent', null, false],
    ]);
    expect(list.find((ping) => ping.id === 'd')?.body).toBeNull();
    expect(todayPings([row({ id: 'a', state: 'sent' })], true)[0]?.body).toBeNull();
  });

  it('counts the budget used without going past it', () => {
    expect(budgetUsed(3, 6)).toEqual({ used: 3, budget: 6, full: false });
    expect(budgetUsed(9, 6)).toEqual({ used: 6, budget: 6, full: true });
    expect(budgetUsed(null, 6).used).toBe(0);
  });

  it('dates the day on the phone calendar', () => {
    expect(localDateOf(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
