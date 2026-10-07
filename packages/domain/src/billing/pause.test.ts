import { describe, expect, it } from 'vitest';

import { pauseRemindAt, pauseReminderDue, pauseResumeAllowed } from './commands';

const at = (iso: string) => new Date(iso);
const RESUME = at('2027-03-01T00:00:00Z');

describe('a planned Pass+ pause', () => {
  it('reminds a week before the resume date', () => {
    expect(pauseRemindAt(RESUME).toISOString()).toBe('2027-02-22T00:00:00.000Z');
  });

  it('takes a resume date in the future, up to a year out', () => {
    const now = at('2026-11-10T00:00:00Z');
    expect(pauseResumeAllowed(RESUME, now)).toBe(true);
    expect(pauseResumeAllowed(now, now)).toBe(false);
    expect(pauseResumeAllowed(at('2026-11-01T00:00:00Z'), now)).toBe(false);
    expect(pauseResumeAllowed(at('2027-11-12T00:00:00Z'), now)).toBe(false);
  });
});

describe('the pause reminder when its timer fires', () => {
  const due = at('2027-02-22T00:00:30Z');
  const paused = { status: 'expired', autoRenew: false, resumeAt: RESUME };

  it('goes out when renewal is still off and the date still stands', () => {
    expect(pauseReminderDue(paused, due)).toBe(true);
    expect(pauseReminderDue({ ...paused, status: 'active' }, due)).toBe(true);
    expect(pauseReminderDue({ ...paused, status: 'cancelled_active' }, due)).toBe(true);
  });

  it('is dropped when renewal is back on', () => {
    expect(pauseReminderDue({ ...paused, status: 'active', autoRenew: true }, due)).toBe(false);
  });

  it('is dropped when the plan was cleared or its date has passed', () => {
    expect(pauseReminderDue({ ...paused, resumeAt: null }, due)).toBe(false);
    expect(pauseReminderDue(paused, at('2027-03-01T00:00:00Z'))).toBe(false);
  });

  it('waits when the date moved later than this timer', () => {
    expect(pauseReminderDue({ ...paused, resumeAt: at('2027-04-01T00:00:00Z') }, due)).toBe(false);
  });

  it('is dropped for a subscription that was refunded or is in a payment problem', () => {
    expect(pauseReminderDue({ ...paused, status: 'revoked' }, due)).toBe(false);
    expect(pauseReminderDue({ ...paused, status: 'billing_retry' }, due)).toBe(false);
  });
});
