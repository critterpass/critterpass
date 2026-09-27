import { describe, expect, it } from 'vitest';

import { fairUseDecision } from '../src/fair-use';

describe('fairUseDecision', () => {
  it('is ok at and under the cap', () => {
    expect(fairUseDecision(1, 300)).toBe('ok');
    expect(fairUseDecision(299, 300)).toBe('ok');
    expect(fairUseDecision(300, 300)).toBe('ok');
  });

  it('degrades to haiku on the unit that first breaches the cap', () => {
    expect(fairUseDecision(301, 300)).toBe('degrade_haiku');
  });

  it('reports busy for every further unit in the same window', () => {
    expect(fairUseDecision(302, 300)).toBe('busy');
    expect(fairUseDecision(1000, 300)).toBe('busy');
  });

  it('holds for a different cap (e.g. redrafts/trip/day)', () => {
    expect(fairUseDecision(20, 20)).toBe('ok');
    expect(fairUseDecision(21, 20)).toBe('degrade_haiku');
    expect(fairUseDecision(22, 20)).toBe('busy');
  });
});
