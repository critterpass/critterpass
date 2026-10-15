import { describe, expect, it } from '@jest/globals';

import { asksByItself, cameraAccessStep } from '../camera-access';

describe('camera access', () => {
  it('reads the step from the permission and the ask in progress', () => {
    const step = (hasPermission: boolean, canRequestPermission: boolean, asking = false) =>
      cameraAccessStep({ hasPermission, canRequestPermission, asking });
    expect(step(true, false)).toBe('live');
    expect(step(true, true, true)).toBe('live');
    expect(step(false, true)).toBe('ask');
    expect(step(false, true, true)).toBe('asking');
    expect(step(false, false)).toBe('denied');
  });

  it('asks by itself only once presented, once, and never over a screen’s own ask state', () => {
    expect(asksByItself('ask', false, false, false)).toBe(false);
    expect(asksByItself('ask', false, true, false)).toBe(true);
    expect(asksByItself('ask', false, true, true)).toBe(false);
    expect(asksByItself('ask', true, true, false)).toBe(false);
    expect(asksByItself('denied', false, true, false)).toBe(false);
    expect(asksByItself('live', false, true, false)).toBe(false);
  });
});
