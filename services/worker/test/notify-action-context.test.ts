/**
 * The ids a push carries for its lock-screen buttons: a disruption's needs-a-yes push names the
 * disruption and the row APPROVE decides, the morning briefing names the line it reads out and the
 * one button that line takes.
 */
import { describe, expect, it } from 'vitest';

import { needsYesContext } from '../src/jobs/disruptions/notify';
import type { RoutedEvent } from '../src/jobs/notify/register';
import { briefingContext } from '../src/jobs/trip-day/notify';

const DISRUPTION = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b12';
const POLL = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b13';
const ITEM = '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b14';

const needsYes: RoutedEvent = {
  id: '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b15',
  type: 'disruption.needs_yes',
  payload: { trip_id: 't1', disruption_id: DISRUPTION, action_id: POLL, affected: 2 },
  crewId: null,
  tripId: null,
  actorId: null,
  occurredAt: new Date('2026-10-07T03:00:00Z'),
};

describe('the ids a push carries for its buttons', () => {
  it('names the disruption and the row to approve, beside the poll', () => {
    expect(needsYesContext(needsYes, 'retime:dinner')).toEqual({
      poll_id: POLL,
      disruption_id: DISRUPTION,
      action_id: 'retime:dinner',
    });
  });

  it('names no row for the crew vote on a storm', () => {
    const ctx = needsYesContext(needsYes, undefined);
    expect(ctx).toEqual({ poll_id: POLL, disruption_id: DISRUPTION });
    expect('action_id' in ctx).toBe(false);
  });

  it('gives a briefing line the one button it takes', () => {
    expect(briefingContext({ id: ITEM, action: 'done' })).toEqual({
      item_id: ITEM,
      actions: ['DONE'],
    });
    expect(briefingContext({ id: ITEM, action: 'nudge' })).toEqual({
      item_id: ITEM,
      actions: ['NUDGE'],
    });
  });

  it('gives a line that only opens the app, or sets a value, no button', () => {
    expect(briefingContext({ id: ITEM, action: 'open' }).actions).toEqual([]);
    expect(briefingContext({ id: ITEM, action: 'set' }).actions).toEqual([]);
  });
});
