import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  approvalClosesAt,
  decideAutonomy,
  FORBIDDEN_ACTION_KINDS,
  GUIDE_ACTION_KINDS,
  PLAN_ACTION_KINDS,
  undoWindowEnd,
  type AutonomyAction,
  type AutonomyContext,
} from '../src';

const NOW = new Date('2026-10-12T08:00:00Z');
const RIN = '0190f0a0-0000-7000-8000-000000000001';
const MAYA = '0190f0a0-0000-7000-8000-000000000002';
const ALEX = '0190f0a0-0000-7000-8000-000000000003';
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

const own: AutonomyAction = {
  kind: 'reschedule_pickup',
  reversible: true,
  costDeltaMinor: 0,
  bookingImpact: false,
  affectedUserIds: [RIN],
  requesterId: RIN,
  timeCritical: false,
};
const ctx: AutonomyContext = { now: NOW, inTrip: false };

describe('decideAutonomy', () => {
  it("runs a free, reversible change to the requester's own item on its own", () => {
    expect(decideAutonomy(own, ctx)).toEqual({ outcome: 'auto' });
  });

  it('asks the affected majority when others are touched, organiser breaking ties', () => {
    const decision = decideAutonomy({ ...own, affectedUserIds: [RIN, MAYA, ALEX, RIN] }, ctx);
    expect(decision).toMatchObject({
      outcome: 'needs_yes',
      reason: 'others_affected',
      decider_policy: 'majority_of_affected',
      threshold: 2,
      tie_breaker: 'organiser',
      affected_user_ids: [RIN, MAYA, ALEX].sort(),
    });
  });

  it('asks any affected member for a time-critical change once the trip is under way', () => {
    const dinner = { ...own, kind: 'retime_item', affectedUserIds: [RIN, MAYA, ALEX] };
    const inTrip = { ...ctx, inTrip: true };
    expect(decideAutonomy({ ...dinner, timeCritical: true }, inTrip)).toMatchObject({
      decider_policy: 'any_affected',
      threshold: 1,
      reason: 'time_critical',
    });
    expect(decideAutonomy({ ...dinner, timeCritical: true }, ctx)).toMatchObject({
      decider_policy: 'majority_of_affected',
    });
  });

  it('puts money before any other rule, even on the requester alone', () => {
    expect(decideAutonomy({ ...own, costDeltaMinor: 1200 }, ctx)).toMatchObject({
      reason: 'money',
      decider_policy: 'majority_of_affected',
      threshold: 1,
    });
    expect(decideAutonomy({ ...own, bookingImpact: true, timeCritical: true }, ctx)).toMatchObject({
      reason: 'money',
    });
    expect(
      decideAutonomy({ ...own, costDeltaMinor: -500, affectedUserIds: [], requesterId: null }, ctx),
    ).toMatchObject({ reason: 'money', decider_policy: 'organiser' });
  });

  it('lets the requester alone decide an irreversible change to their own item', () => {
    expect(decideAutonomy({ ...own, kind: 'remove_item', reversible: false }, ctx)).toMatchObject({
      decider_policy: 'self',
      reason: 'irreversible',
    });
  });

  it('hands proactive or unattributed changes to the organiser', () => {
    expect(decideAutonomy({ ...own, requesterId: null }, ctx)).toMatchObject({
      decider_policy: 'majority_of_affected',
    });
    expect(decideAutonomy({ ...own, requesterId: RIN, affectedUserIds: [] }, ctx)).toMatchObject({
      decider_policy: 'organiser',
      reason: 'no_requester',
    });
  });

  it.each([...FORBIDDEN_ACTION_KINDS, 'text_the_driver'])('never runs %s', (kind) => {
    expect(decideAutonomy({ ...own, kind }, ctx)).toEqual({
      outcome: 'forbidden',
      reason: 'forbidden_kind',
    });
  });

  it('closes a vote at the earliest of the window, an item start ahead and any hold expiry', () => {
    const decision = decideAutonomy(
      { ...own, affectedUserIds: [RIN, MAYA] },
      { ...ctx, itemStarts: [at(-1), at(10)], holdExpiries: [at(6), at(30)] },
    );
    expect(decision).toMatchObject({ closes_at: at(6).toISOString() });
    expect(approvalClosesAt({ ...ctx, itemStarts: [at(-2)] })).toEqual(at(24));
    expect(approvalClosesAt({ ...ctx, itemStarts: [at(3)] })).toEqual(at(3));
  });
});

describe('undoWindowEnd', () => {
  it('ends after the default window or at the touched item start, whichever is first', () => {
    expect(undoWindowEnd(NOW, [])).toEqual(at(24));
    expect(undoWindowEnd(NOW, [at(5), at(14)])).toEqual(at(5));
    expect(undoWindowEnd(NOW, [at(-1)])).toEqual(NOW);
    expect(undoWindowEnd(NOW, [], 2 * HOUR)).toEqual(at(2));
  });
});

const uid = fc.constantFrom(RIN, MAYA, ALEX, '0190f0a0-0000-7000-8000-000000000004');
const actionArb = fc.record({
  kind: fc.oneof(fc.constantFrom(...GUIDE_ACTION_KINDS), fc.string()),
  reversible: fc.boolean(),
  costDeltaMinor: fc.oneof(fc.constant(0), fc.integer({ min: -1_000_000, max: 1_000_000 })),
  bookingImpact: fc.boolean(),
  affectedUserIds: fc.array(uid, { maxLength: 6 }),
  requesterId: fc.option(uid, { nil: null }),
  timeCritical: fc.boolean(),
});
const hoursArb = fc.array(fc.integer({ min: -48, max: 96 }), { maxLength: 4 });
const ctxArb = fc.record({
  inTrip: fc.boolean(),
  holdHours: hoursArb,
  startHours: hoursArb,
});

describe('decideAutonomy properties', { timeout: 60_000 }, () => {
  it('never runs money- or others-affecting, irreversible or forbidden actions', () => {
    fc.assert(
      fc.property(actionArb, ctxArb, (action, raw) => {
        const context = {
          now: NOW,
          inTrip: raw.inTrip,
          holdExpiries: raw.holdHours.map(at),
          itemStarts: raw.startHours.map(at),
        };
        const decision = decideAutonomy(action, context);
        const others = action.affectedUserIds.some((id) => id !== action.requesterId);
        const money = action.costDeltaMinor !== 0 || action.bookingImpact;
        const known = (PLAN_ACTION_KINDS as readonly string[]).includes(action.kind);
        if (money || others || !action.reversible || !known || action.requesterId === null) {
          expect(decision.outcome).not.toBe('auto');
        }
        if (!known) expect(decision.outcome).toBe('forbidden');
        if (decision.outcome === 'needs_yes') {
          const closes = new Date(decision.closes_at);
          for (const hold of context.holdExpiries) expect(closes <= hold).toBe(true);
          expect(closes <= at(24)).toBe(true);
          expect(decision.threshold).toBeGreaterThanOrEqual(1);
          expect(decision.threshold).toBeLessThanOrEqual(
            Math.max(1, decision.affected_user_ids.length),
          );
        }
      }),
      { numRuns: 2000 },
    );
  });
});
