/**
 * The builder's send and reply-by rules: SEND sends what is built only when it matches what the
 * organiser chose, rebuilds otherwise (never offline), and every reply-by on offer leaves the crew
 * time to answer and ends before free cancellation on a booked stay and before the trip starts.
 */
import { describe, expect, it } from '@jest/globals';

import { DEFAULT_CONFIG, replyByChoices, sendPlan } from '../builder/model';
import type { Proposal } from '../data/proposal';

const built: Proposal = {
  id: '0190c0de-0000-7000-8000-000000000001',
  tripId: '0190c0de-0000-7000-8000-000000000002',
  status: 'building',
  format: 'trailer',
  showCost: true,
  personal: true,
  replyBy: '2026-10-01T13:00:00.000Z',
  freeCancelUntil: null,
  sentAt: null,
  lockedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('sendPlan', () => {
  it('sends the built proposal when the config still matches', () => {
    expect(
      sendPlan({ proposal: built, config: DEFAULT_CONFIG, recipients: 1, offline: true }),
    ).toEqual({ kind: 'send', proposalId: built.id });
  });

  it('rebuilds when a toggle changed, and refuses to rebuild offline', () => {
    const config = { ...DEFAULT_CONFIG, showCost: false };
    expect(sendPlan({ proposal: built, config, recipients: 1, offline: false })).toEqual({
      kind: 'build_then_send',
    });
    expect(sendPlan({ proposal: built, config, recipients: 1, offline: true })).toEqual({
      kind: 'blocked',
      reason: 'offline_build',
    });
  });

  it('has nobody to send to without recipients, and never resends a sent proposal', () => {
    expect(
      sendPlan({ proposal: null, config: DEFAULT_CONFIG, recipients: 0, offline: false }),
    ).toEqual({ kind: 'blocked', reason: 'no_recipients' });
    expect(
      sendPlan({
        proposal: { ...built, status: 'sent' },
        config: DEFAULT_CONFIG,
        recipients: 2,
        offline: false,
      }),
    ).toEqual({ kind: 'blocked', reason: 'sent' });
  });
});

describe('replyByChoices', () => {
  const now = new Date('2026-09-20T02:00:00.000Z');

  it('stops before the earliest free cancellation of a booked stay', () => {
    const freeCancel = '2026-09-24T00:00:00.000Z';
    const choices = replyByChoices({
      freeCancelDeadlines: ['2026-09-28T00:00:00.000Z', freeCancel],
      tripStart: '2026-10-10',
      now,
    });
    expect(choices.length).toBeGreaterThan(0);
    for (const at of choices) {
      expect(at.getTime()).toBeLessThanOrEqual(new Date(freeCancel).getTime());
      expect(at.getTime()).toBeGreaterThanOrEqual(now.getTime() + 3_600_000);
    }
  });

  it('is not bounded by a trip already under way or a free cancellation that passed', () => {
    const choices = replyByChoices({
      freeCancelDeadlines: ['2026-09-10T00:00:00.000Z'],
      tripStart: '2026-09-19',
      now,
    });
    expect(choices.length).toBe(10);
    expect(choices[0]!.getTime()).toBeGreaterThanOrEqual(now.getTime() + 3_600_000);
  });
});
