import { describe, expect, it } from '@jest/globals';

import {
  briefingClock,
  briefingState,
  nextBriefing,
  type BriefingItemRow,
  type BriefingRow,
} from '../briefing-model';

const TODAY = '2026-10-02';
const ROW: BriefingRow = {
  id: 'b1',
  local_date: TODAY,
  status: 'ready',
  fallback_used: 0,
  built_at: '2026-10-02T00:00:05Z',
};
const ITEM: BriefingItemRow = {
  id: 'i1',
  position: 0,
  icon: 'plane',
  text: 'Your flight moved to 22:40.',
  action: 'nudge',
  target_user_ids: '["u2"]',
  deep_link: null,
  status: 'open',
  source: 'daily_job',
};

/** A three-day trip on its first day, mid-afternoon, online, the local read answered. */
function state(over: Partial<Parameters<typeof briefingState>[0]> = {}) {
  return briefingState({
    read: 'settled',
    briefing: null,
    items: [],
    pending: [],
    clock: { date: TODAY, time: '15:30' },
    offline: false,
    briefed: true,
    startDate: TODAY,
    endDate: '2026-10-04',
    ...over,
  });
}

describe('briefing card state', () => {
  it('waits only for the first local read, then settles', () => {
    expect(state({ read: 'pending' })).toEqual({ kind: 'loading' });
    expect(state({ read: 'pending', briefing: ROW, items: [ITEM] })).toEqual({ kind: 'loading' });
    expect(state({ briefing: ROW, items: [ITEM] }).kind).toBe('ready');
    expect(state().kind).toBe('none');
    expect(state({ read: 'failed' })).toEqual({ kind: 'failed' });
  });

  it('says nothing needs me when there is no row for me today, whatever the hour', () => {
    // Someone who joined a trip under way, or a trip confirmed after the morning's run.
    expect(state()).toEqual({ kind: 'none', next: { on: 'tomorrow' } });
    expect(state({ clock: { date: TODAY, time: '23:59' } })).toEqual({
      kind: 'none',
      next: { on: 'tomorrow' },
    });
    // Yesterday's row is not today's.
    expect(state({ briefing: { ...ROW, local_date: '2026-10-01' }, items: [ITEM] })).toEqual({
      kind: 'none',
      next: { on: 'tomorrow' },
    });
  });

  it("promises today's briefing only until the morning is over", () => {
    expect(state({ clock: { date: TODAY, time: '06:10' } })).toEqual({
      kind: 'none',
      next: { on: 'today' },
    });
    expect(state({ clock: { date: TODAY, time: '07:15' } })).toEqual({
      kind: 'none',
      next: { on: 'tomorrow' },
    });
    // A row an event opened before the morning's run, with no lines yet, is still to be written.
    const early = { ...ROW, built_at: null };
    expect(state({ briefing: early, clock: { date: TODAY, time: '06:10' } })).toEqual({
      kind: 'none',
      next: { on: 'today' },
    });
  });

  it('names the day the briefings start before they do, and nothing after the last one', () => {
    expect(state({ clock: { date: '2026-08-20', time: '12:00' } })).toEqual({
      kind: 'none',
      next: { on: 'date', date: '2026-09-02' },
    });
    expect(state({ briefing: { ...ROW, status: 'empty' } })).toEqual({
      kind: 'none',
      next: { on: 'tomorrow' },
    });
    expect(state({ clock: { date: '2026-10-04', time: '15:30' } })).toEqual({
      kind: 'none',
      next: null,
    });
  });

  it('shows the lines with my queued chip taps applied, and a failed build as failed', () => {
    const ready = state({
      briefing: ROW,
      items: [ITEM],
      pending: [{ item_id: 'i1', action: 'nudge' }],
    });
    expect(ready).toMatchObject({ kind: 'ready', staleDate: null });
    expect(ready.kind === 'ready' ? ready.lines[0] : null).toMatchObject({
      status: 'nudged',
      targets: ['u2'],
    });
    expect(state({ briefing: { ...ROW, status: 'failed' } })).toEqual({ kind: 'failed' });
  });

  it("keeps yesterday's lines while offline, dated", () => {
    const stale = { ...ROW, local_date: '2026-10-01' };
    expect(state({ briefing: stale, items: [ITEM], offline: true })).toMatchObject({
      kind: 'ready',
      staleDate: '2026-10-01',
    });
  });

  it('is hidden while the trip is being planned and once it is over', () => {
    expect(state({ briefed: false, read: 'pending' })).toEqual({ kind: 'hidden' });
    expect(state({ briefed: false, briefing: ROW, items: [ITEM] })).toEqual({ kind: 'hidden' });
  });
});

describe('briefing clock', () => {
  const zones = { tripTz: 'Asia/Makassar', ownTz: 'Asia/Saigon' };

  it("counts mornings on my own clock before the trip and on the trip's from day one", () => {
    // 23:30 in Saigon is already tomorrow in Bali.
    const late = new Date('2026-10-01T16:30:00Z');
    expect(briefingClock(late, { ...zones, startDate: '2026-10-21' })).toEqual({
      date: '2026-10-01',
      time: '23:30',
    });
    expect(briefingClock(late, { ...zones, startDate: '2026-10-01' })).toEqual({
      date: '2026-10-02',
      time: '00:30',
    });
  });

  it('has no next briefing for a trip without dates', () => {
    expect(
      nextBriefing({
        clock: { date: TODAY, time: '09:00' },
        startDate: null,
        endDate: null,
        built: false,
      }),
    ).toBeNull();
  });
});
