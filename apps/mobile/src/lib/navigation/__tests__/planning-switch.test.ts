/**
 * The planning switch reads on (the section 7 screens) and the trip map whenever its config has not
 * synced or is unreadable, turns off only on an explicit `false` from the server, follows the synced
 * values when they arrive, keeps them for the next launch, forgets them on sign-out, and gives way
 * to the developer override.
 */
import { describe, expect, it, jest } from '@jest/globals';

import {
  applyPlanningSwitch,
  planHub,
  planningRedesign,
  planningRedesignSource,
  readPlanningSwitch,
  reloadPlanningSwitchForTests,
  resetPlanningSwitch,
  setPlanningRedesignOverride,
  subscribePlanningSwitch,
} from '../planning-switch';

describe('readPlanningSwitch', () => {
  it('falls back to on and the trip map when the config is missing', () => {
    expect(readPlanningSwitch([])).toEqual({ redesign: true, hub: 'map' });
    expect(readPlanningSwitch([{ key: 'plan.hub', value: '"day"' }])).toEqual({
      redesign: true,
      hub: 'day',
    });
  });

  it('turns off only on an explicit false from the server', () => {
    expect(readPlanningSwitch([{ key: 'planning.redesign', value: 'false' }]).redesign).toBe(false);
    expect(readPlanningSwitch([{ key: 'planning.redesign', value: '0' }]).redesign).toBe(false);
    expect(readPlanningSwitch([{ key: 'planning.redesign', value: 'true' }]).redesign).toBe(true);
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
    ).toEqual({ redesign: true, hub: 'map' });
    expect(readPlanningSwitch([{ key: 'planning.redesign', value: null }]).redesign).toBe(true);
  });
});

describe('the switch read at navigation time', () => {
  it('starts on before any config syncs, follows a change once and forgets it on sign-out', () => {
    resetPlanningSwitch();
    expect(planningRedesign()).toBe(true);
    expect(planningRedesignSource()).toBe('default');
    expect(planHub()).toBe('map');
    const heard = jest.fn();
    const stop = subscribePlanningSwitch(heard);
    applyPlanningSwitch({ redesign: false, hub: 'day' });
    applyPlanningSwitch({ redesign: false, hub: 'day' });
    expect(planningRedesign()).toBe(false);
    expect(planHub()).toBe('day');
    expect(heard).toHaveBeenCalledTimes(1);
    // The server's explicit off is kept for the next launch.
    reloadPlanningSwitchForTests();
    expect(planningRedesign()).toBe(false);
    expect(planningRedesignSource()).toBe('config');
    resetPlanningSwitch();
    expect(planningRedesign()).toBe(true);
    stop();
  });
});

describe('the developer override', () => {
  it('wins over the synced config both ways, and clearing it follows the config again', () => {
    resetPlanningSwitch();
    setPlanningRedesignOverride(null);
    expect(planningRedesignSource()).toBe('default');
    applyPlanningSwitch({ redesign: false, hub: 'map' });
    expect(planningRedesignSource()).toBe('config');

    setPlanningRedesignOverride(true);
    expect(planningRedesign()).toBe(true);
    expect(planningRedesignSource()).toBe('override');
    // A config change underneath leaves the override in force.
    applyPlanningSwitch({ redesign: false, hub: 'day' });
    expect(planningRedesign()).toBe(true);
    expect(planHub()).toBe('day');

    applyPlanningSwitch({ redesign: true, hub: 'day' });
    setPlanningRedesignOverride(false);
    expect(planningRedesign()).toBe(false);

    setPlanningRedesignOverride(null);
    expect(planningRedesign()).toBe(true);
    expect(planningRedesignSource()).toBe('config');
    resetPlanningSwitch();
  });

  it('is kept for the next launch and outlives a sign-out', () => {
    resetPlanningSwitch();
    setPlanningRedesignOverride(true);
    reloadPlanningSwitchForTests();
    expect(planningRedesign()).toBe(true);
    expect(planningRedesignSource()).toBe('override');
    resetPlanningSwitch();
    expect(planningRedesign()).toBe(true);
    setPlanningRedesignOverride(false);
    reloadPlanningSwitchForTests();
    expect(planningRedesign()).toBe(false);
    expect(planningRedesignSource()).toBe('override');
    setPlanningRedesignOverride(null);
    reloadPlanningSwitchForTests();
    expect(planningRedesign()).toBe(true);
    expect(planningRedesignSource()).toBe('default');
  });
});
