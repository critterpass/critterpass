import { describe, expect, it } from 'vitest';

import { legsJobFor } from '../../src/planning/legs';
import { PLAN_LEGS_DEBOUNCE_SECONDS, PLANNING_QUEUES } from '../../src/planning/queues';

const TRIP = '0199c000-0000-7000-8000-000000000001';

describe('legsJobFor', () => {
  it.each([
    'draft.ready',
    'draft.version_restored',
    'draft.ops_applied',
    'redraft.kept',
    'proposal.sent',
    'proposal.locked',
    'plan.ops_applied',
    'change_set.applied',
    'change_set.reverted',
    'booking.edited',
  ])('asks for one debounced run per trip after %s', (type) => {
    expect(legsJobFor({ type, tripId: TRIP })).toEqual({
      queue: PLANNING_QUEUES.legs,
      options: { singletonKey: `legs:${TRIP}`, startAfter: PLAN_LEGS_DEBOUNCE_SECONDS },
    });
  });

  it('asks for nothing after an event that moves no leg, or one with no trip', () => {
    expect(legsJobFor({ type: 'draft.requested', tripId: TRIP })).toBeNull();
    expect(legsJobFor({ type: 'redraft.reverted', tripId: TRIP })).toBeNull();
    expect(legsJobFor({ type: 'chat.message_sent', tripId: TRIP })).toBeNull();
    expect(legsJobFor({ type: 'proposal.locked', tripId: null })).toBeNull();
  });
});
