/**
 * The plan hub opens the trip map until its config syncs or when the value is unreadable, opens the
 * day plan only for `day`, follows the synced value when it arrives, keeps it for the next launch
 * and forgets it on sign-out.
 */
import { describe, expect, it, jest } from '@jest/globals';

import {
  applyPlanHub,
  planHub,
  readPlanHub,
  reloadPlanHubForTests,
  resetPlanHub,
  subscribePlanHub,
} from '../plan-hub-setting';

describe('readPlanHub', () => {
  it('opens the trip map when the config is missing', () => {
    expect(readPlanHub([])).toBe('map');
  });

  it('reads day as JSON text or a bare word', () => {
    expect(readPlanHub([{ key: 'plan.hub', value: '"day"' }])).toBe('day');
    expect(readPlanHub([{ key: 'plan.hub', value: 'day' }])).toBe('day');
  });

  it('reads anything else as the trip map', () => {
    expect(readPlanHub([{ key: 'plan.hub', value: '"map"' }])).toBe('map');
    expect(readPlanHub([{ key: 'plan.hub', value: '"calendar"' }])).toBe('map');
    expect(readPlanHub([{ key: 'plan.hub', value: '{"day":' }])).toBe('map');
    expect(readPlanHub([{ key: 'plan.hub', value: null }])).toBe('map');
  });
});

describe('the hub read at navigation time', () => {
  it('starts on the map, follows a change once, keeps it across a relaunch, forgets it on sign-out', () => {
    resetPlanHub();
    expect(planHub()).toBe('map');
    const heard = jest.fn();
    const stop = subscribePlanHub(heard);
    applyPlanHub('day');
    applyPlanHub('day');
    expect(planHub()).toBe('day');
    expect(heard).toHaveBeenCalledTimes(1);
    reloadPlanHubForTests();
    expect(planHub()).toBe('day');
    resetPlanHub();
    expect(planHub()).toBe('map');
    reloadPlanHubForTests();
    expect(planHub()).toBe('map');
    stop();
  });
});
