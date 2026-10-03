/**
 * The planning switch reads off and the trip map whenever its config is missing or unreadable,
 * follows the synced values when they arrive, keeps them for the next launch, and forgets them on
 * sign-out.
 */
import { describe, expect, it, jest } from '@jest/globals';

import {
  applyPlanningSwitch,
  planHub,
  planningRedesign,
  readPlanningSwitch,
  resetPlanningSwitch,
  subscribePlanningSwitch,
} from '../planning-switch';

describe('readPlanningSwitch', () => {
  it('falls back to off and the trip map when the config is missing', () => {
    expect(readPlanningSwitch([])).toEqual({ redesign: false, hub: 'map' });
  });

  it('reads the synced values as JSON text or bare words', () => {
    expect(
      readPlanningSwitch([
        { key: 'planning.redesign', value: 'true' },
        { key: 'plan.hub', value: '"day"' },
      ]),
    ).toEqual({ redesign: true, hub: 'day' });
    expect(readPlanningSwitch([{ key: 'plan.hub', value: 'day' }]).hub).toBe('day');
  });

  it('keeps the defaults for values it cannot read', () => {
    expect(
      readPlanningSwitch([
        { key: 'planning.redesign', value: '{"on":' },
        { key: 'plan.hub', value: '"calendar"' },
      ]),
    ).toEqual({ redesign: false, hub: 'map' });
    expect(readPlanningSwitch([{ key: 'planning.redesign', value: null }]).redesign).toBe(false);
  });
});

describe('the switch read at navigation time', () => {
  it('starts off, follows a change once and forgets it on sign-out', () => {
    resetPlanningSwitch();
    expect(planningRedesign()).toBe(false);
    expect(planHub()).toBe('map');
    const heard = jest.fn();
    const stop = subscribePlanningSwitch(heard);
    applyPlanningSwitch({ redesign: true, hub: 'day' });
    applyPlanningSwitch({ redesign: true, hub: 'day' });
    expect(planningRedesign()).toBe(true);
    expect(planHub()).toBe('day');
    expect(heard).toHaveBeenCalledTimes(1);
    resetPlanningSwitch();
    expect(planningRedesign()).toBe(false);
    stop();
  });
});
