/**
 * "Your plan" from the synced rows: the subscription row decides the wording and what can be
 * managed, the server's Pass+ flag alone decides whether Pass+ is on.
 */
import { describe, expect, it } from '@jest/globals';

import type { Subscription } from '../../data/billing-rows';
import { boostLines, planModel, type PlanInput } from '../plan-model';

const sub = (over: Partial<Subscription>): Subscription => ({
  id: 's1',
  platform: 'app_store',
  productKey: 'pass_monthly',
  status: 'active',
  autoRenew: true,
  periodEnd: '2026-12-02T00:00:00Z',
  graceEndsAt: null,
  resumeAt: null,
  ...over,
});

const plan = (over: Partial<PlanInput>) =>
  planModel({
    subscriptions: [sub({})],
    passPlus: true,
    passPlusUntil: '2026-12-02T00:00:00Z',
    deviceStore: 'app_store',
    ...over,
  });

describe('planModel', () => {
  it('is free with no rows and no Pass+', () => {
    const free = plan({ subscriptions: [], passPlus: false, passPlusUntil: null });
    expect(free).toMatchObject({
      kind: 'free',
      passPlus: false,
      canCancel: false,
      canPause: false,
    });
  });

  it('a renewing monthly plan can be paused or cancelled; a yearly one only cancelled', () => {
    expect(plan({})).toMatchObject({
      kind: 'active',
      period: 'monthly',
      date: '2026-12-02T00:00:00Z',
      canPause: true,
      canCancel: true,
      hasIssue: false,
    });
    expect(plan({ subscriptions: [sub({ productKey: 'pass_yearly' })] })).toMatchObject({
      kind: 'active',
      period: 'yearly',
      canPause: false,
      canCancel: true,
    });
  });

  it('auto-renew off runs to the period end with nothing left to cancel', () => {
    for (const row of [sub({ status: 'cancelled_active' }), sub({ autoRenew: false })]) {
      expect(plan({ subscriptions: [row] })).toMatchObject({
        kind: 'cancelled',
        date: '2026-12-02T00:00:00Z',
        canCancel: false,
        canPause: false,
      });
    }
  });

  it('grace keeps Pass+ on until the grace end and needs the person', () => {
    const grace = plan({
      subscriptions: [sub({ status: 'grace', graceEndsAt: '2026-12-09T00:00:00Z' })],
    });
    expect(grace).toMatchObject({
      kind: 'grace',
      passPlus: true,
      date: '2026-12-09T00:00:00Z',
      hasIssue: true,
      canPause: false,
    });
  });

  it('after the grace the plan is off until paid, as the server says', () => {
    for (const status of ['billing_retry', 'on_hold'] as const) {
      expect(plan({ subscriptions: [sub({ status })], passPlus: false })).toMatchObject({
        kind: 'payment_failed',
        passPlus: false,
        hasIssue: true,
        date: null,
      });
    }
  });

  it('a paused plan shows when it resumes', () => {
    expect(
      plan({
        subscriptions: [sub({ status: 'paused', resumeAt: '2027-03-02T00:00:00Z' })],
        passPlus: false,
      }),
    ).toMatchObject({ kind: 'paused', date: '2027-03-02T00:00:00Z', canCancel: false });
  });

  it('an expired plan with no other Pass+ reads as expired; with a grant it reads as granted', () => {
    const expired = [sub({ status: 'expired' })];
    expect(plan({ subscriptions: expired, passPlus: false, passPlusUntil: null }).kind).toBe(
      'expired',
    );
    expect(
      plan({ subscriptions: expired, passPlus: true, passPlusUntil: '2027-01-01T00:00:00Z' }),
    ).toMatchObject({ kind: 'granted', date: '2027-01-01T00:00:00Z', platform: null });
  });

  it('Pass+ with no store row is a grant: nothing to manage, pause or cancel', () => {
    expect(plan({ subscriptions: [], passPlusUntil: '2027-02-01T00:00:00Z' })).toMatchObject({
      kind: 'granted',
      manageHere: false,
      canCancel: false,
      canPause: false,
    });
    // A gift row is not a store subscription either.
    expect(plan({ subscriptions: [sub({ platform: 'gift' })] }).kind).toBe('granted');
  });

  it('a plan billed by the other store cannot be managed here', () => {
    expect(plan({ deviceStore: 'play' })).toMatchObject({
      platform: 'app_store',
      manageHere: false,
    });
    expect(plan({ deviceStore: 'app_store' }).manageHere).toBe(true);
    expect(plan({ deviceStore: null }).manageHere).toBe(false);
  });

  it('a live row wins over an older lapsed one, and a crew yearly boost is not the Pass+ plan', () => {
    const live = plan({
      subscriptions: [sub({ id: 'old', status: 'expired' }), sub({ id: 'new', status: 'grace' })],
    });
    expect(live.kind).toBe('grace');
    expect(
      plan({
        subscriptions: [sub({ productKey: 'boost_crew_year' })],
        passPlusUntil: '2027-06-01T00:00:00Z',
      }).kind,
    ).toBe('granted');
  });

  it('never claims Pass+ the server has not granted', () => {
    expect(plan({ passPlus: false }).passPlus).toBe(false);
  });
});

describe('boostLines', () => {
  it('lists running boosts first and keeps what paid for each', () => {
    const lines = boostLines([
      {
        id: 'a',
        trip_id: 't1',
        source: 'first_trip_free',
        status: 'ended',
        ends_at: '2026-10-26T00:00:00Z',
        destination: 'Bali',
        crew: 'the Bali Six',
      },
      {
        id: 'b',
        trip_id: 't2',
        source: 'purchase',
        status: 'active',
        ends_at: '2027-04-16T00:00:00Z',
        destination: 'Kyoto',
        crew: null,
      },
    ]);
    expect(lines.map((line) => [line.id, line.on, line.source])).toEqual([
      ['b', true, 'purchase'],
      ['a', false, 'first_trip_free'],
    ]);
  });
});
