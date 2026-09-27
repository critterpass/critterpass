/**
 * The router's pure rules, property-tested over 1,000 random days each: ALWAYS is never deferred,
 * the daily budget is never exceeded, quiet hours hold every BUDGET push, the paywall governor lets
 * at most one paywall push through a day. Plus the catalogue invariants the router relies on.
 */
import {
  ANDROID_CHANNELS,
  getNotificationSpec,
  NOTIFICATION_KEYS,
  renderCollapseKey,
  resolveNotificationClass,
  type NotificationClass,
} from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PAYWALL_PUSHES_PER_DAY } from '../src/jobs/notify/governor';
import {
  clockMinutes,
  decide,
  inQuietHours,
  localClock,
  type DecideInput,
} from '../src/jobs/notify/policy';

const RUNS = { numRuns: 1000 };
const minute = fc.integer({ min: 0, max: 24 * 60 - 1 });
const quiet = fc.record({ fromMinutes: minute, toMinutes: minute });
const cls = fc.constantFrom<NotificationClass>(
  'always',
  'budgeted',
  'roundup_only',
  'silent',
  'local',
);

const input = fc.record<DecideInput>({
  class: cls,
  paywall: fc.boolean(),
  onlyIfBackgrounded: fc.boolean(),
  prefEnabled: fc.boolean(),
  expired: fc.boolean(),
  inForeground: fc.boolean(),
  localMinutes: minute,
  quiet,
  budgetPerDay: fc.integer({ min: 1, max: 10 }),
  sentBudgeted: fc.integer({ min: 0, max: 12 }),
  paywallSent: fc.integer({ min: 0, max: 3 }),
});

/** Routes a day of notifications in order, booking sends the way the ledger does. */
function simulateDay(items: readonly DecideInput[]) {
  let sentBudgeted = 0;
  let paywallSent = 0;
  const decisions = items.map((item) => {
    const decision = decide({ ...item, sentBudgeted, paywallSent });
    if (decision.action === 'send' && item.class === 'budgeted') {
      sentBudgeted += 1;
      if (item.paywall) paywallSent += 1;
    }
    return { item, decision };
  });
  return { decisions, sentBudgeted, paywallSent };
}

describe('decide', () => {
  it('always sends an unexpired ALWAYS item, whatever the budget, hour or prefs', () => {
    fc.assert(
      fc.property(input, (item) => {
        const decision = decide({ ...item, class: 'always', expired: false });
        expect(decision).toEqual({ action: 'send' });
      }),
      RUNS,
    );
  });

  it('never sends more BUDGET pushes in a day than the budget allows', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.array(input, { maxLength: 40 }),
        (budget, items) => {
          const day = simulateDay(items.map((item) => ({ ...item, budgetPerDay: budget })));
          expect(day.sentBudgeted).toBeLessThanOrEqual(budget);
        },
      ),
      RUNS,
    );
  });

  it('holds every BUDGET push inside quiet hours', () => {
    fc.assert(
      fc.property(input, (item) => {
        fc.pre(inQuietHours(item.localMinutes, item.quiet));
        const decision = decide({ ...item, class: 'budgeted' });
        expect(decision.action).not.toBe('send');
      }),
      RUNS,
    );
  });

  it('lets at most one paywall push through a day', () => {
    fc.assert(
      fc.property(fc.array(input, { maxLength: 40 }), (items) => {
        const day = simulateDay(items.map((item) => ({ ...item, paywall: true })));
        expect(day.paywallSent).toBeLessThanOrEqual(PAYWALL_PUSHES_PER_DAY);
      }),
      RUNS,
    );
  });

  it('rolls over-budget and quiet-hour BUDGET items into the roundup instead of dropping them', () => {
    const base: DecideInput = {
      class: 'budgeted',
      paywall: false,
      onlyIfBackgrounded: false,
      prefEnabled: true,
      expired: false,
      inForeground: false,
      localMinutes: 12 * 60,
      quiet: { fromMinutes: 22 * 60, toMinutes: 7 * 60 },
      budgetPerDay: 5,
      sentBudgeted: 0,
      paywallSent: 0,
    };
    expect(decide(base)).toEqual({ action: 'send' });
    expect(decide({ ...base, sentBudgeted: 5 })).toEqual({
      action: 'roundup',
      reason: 'budget_exhausted',
    });
    expect(decide({ ...base, localMinutes: 23 * 60 })).toEqual({
      action: 'roundup',
      reason: 'quiet_hours',
    });
    expect(decide({ ...base, class: 'roundup_only' })).toEqual({
      action: 'roundup',
      reason: 'roundup_class',
    });
    expect(decide({ ...base, onlyIfBackgrounded: true, inForeground: true })).toEqual({
      action: 'drop',
      reason: 'in_foreground',
    });
    expect(decide({ ...base, prefEnabled: false })).toEqual({ action: 'drop', reason: 'pref_off' });
    expect(decide({ ...base, class: 'silent' })).toEqual({ action: 'drop', reason: 'not_routed' });
    expect(decide({ ...base, class: 'always', expired: true })).toEqual({
      action: 'drop',
      reason: 'expired',
    });
  });
});

describe('clock helpers', () => {
  it('treats a wrapping quiet window as covering both sides of midnight', () => {
    const window = { fromMinutes: clockMinutes('22:00'), toMinutes: clockMinutes('07:00:00') };
    expect(inQuietHours(clockMinutes('23:30'), window)).toBe(true);
    expect(inQuietHours(clockMinutes('06:59'), window)).toBe(true);
    expect(inQuietHours(clockMinutes('07:00'), window)).toBe(false);
    expect(inQuietHours(clockMinutes('12:00'), { fromMinutes: 600, toMinutes: 600 })).toBe(false);
  });

  it('reads the local date and time in the recipient zone', () => {
    const instant = new Date('2026-09-27T16:30:00Z');
    expect(localClock(instant, 'Asia/Ho_Chi_Minh')).toEqual({
      date: '2026-09-27',
      minutes: 23 * 60 + 30,
    });
    expect(localClock(instant, 'Pacific/Auckland')).toEqual({
      date: '2026-09-28',
      minutes: 5 * 60 + 30,
    });
  });
});

describe('notification catalogue', () => {
  it('has unique keys and a known Android channel for each', () => {
    expect(new Set(NOTIFICATION_KEYS).size).toBe(NOTIFICATION_KEYS.length);
    for (const key of NOTIFICATION_KEYS) {
      expect(ANDROID_CHANNELS).toContain(getNotificationSpec(key)?.channel);
    }
  });

  it('puts the always-deliver set in the ALWAYS class', () => {
    const alwaysKeys = [
      'sos',
      'crew_knock',
      'flight_changed',
      'boarding_open',
      'running_late_detected',
      'reply_by_expiring',
      'hold_expiring',
      'billing_failed',
      'disruption_update',
    ];
    for (const key of alwaysKeys) expect(getNotificationSpec(key)?.class).toBe('always');
    const alarm = getNotificationSpec('leave_by_alarm');
    expect(alarm && resolveNotificationClass(alarm, { remote: true })).toBe('always');
  });

  it('resolves the event-dependent classes', () => {
    const money = getNotificationSpec('money_event');
    const watch = getNotificationSpec('watch_escalation');
    expect(money && resolveNotificationClass(money, { small: true })).toBe('roundup_only');
    expect(money && resolveNotificationClass(money)).toBe('budgeted');
    expect(watch && resolveNotificationClass(watch, { planChanging: true })).toBe('always');
    expect(watch && resolveNotificationClass(watch)).toBe('roundup_only');
  });

  it('renders collapse keys only when every variable is known', () => {
    expect(renderCollapseKey('vote:{poll_id}', { poll_id: 'p1' })).toBe('vote:p1');
    expect(renderCollapseKey('vote:{poll_id}', {})).toBeUndefined();
    expect(renderCollapseKey(undefined, { poll_id: 'p1' })).toBeUndefined();
  });
});
