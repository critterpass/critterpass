import { WIDGET_DAILY_CAP, WIDGET_DEBOUNCE_MS } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { decideWidgetPush } from '../../src/jobs/widgets';

const NOW = new Date('2026-10-02T09:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('widget push decision', () => {
  it('sends the first routine push and holds the next until the window ends', () => {
    expect(
      decideWidgetPush({ priority: false, now: NOW, sentToday: 0, lastRoutineAt: null }),
    ).toEqual({ action: 'send' });
    expect(
      decideWidgetPush({ priority: false, now: NOW, sentToday: 1, lastRoutineAt: ago(60_000) }),
    ).toEqual({ action: 'defer', until: new Date(NOW.getTime() - 60_000 + WIDGET_DEBOUNCE_MS) });
    expect(
      decideWidgetPush({
        priority: false,
        now: NOW,
        sentToday: 1,
        lastRoutineAt: ago(WIDGET_DEBOUNCE_MS),
      }),
    ).toEqual({ action: 'send' });
  });

  it('stops routine pushes at the daily cap but still sends a priority one', () => {
    const spent = { now: NOW, sentToday: WIDGET_DAILY_CAP, lastRoutineAt: ago(3_600_000) };
    expect(decideWidgetPush({ ...spent, priority: false })).toEqual({
      action: 'skip',
      reason: 'daily_cap',
    });
    expect(decideWidgetPush({ ...spent, priority: true })).toEqual({ action: 'send' });
  });

  it('sends a priority push inside the debounce window', () => {
    expect(
      decideWidgetPush({ priority: true, now: NOW, sentToday: 3, lastRoutineAt: ago(1_000) }),
    ).toEqual({ action: 'send' });
  });
});
