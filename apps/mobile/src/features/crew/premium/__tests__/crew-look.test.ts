import { describe, expect, it } from '@jest/globals';

import { premium } from '@cp/design-tokens';

import { coverOptions, memberAccent, passInk } from '../crew-look';

describe('crew pass look', () => {
  it('offers the earned covers locked until the referral stamps unlock them', () => {
    const locked = (stamps: number) =>
      coverOptions(stamps)
        .filter((option) => option.locked)
        .map((option) => option.cover);
    expect(locked(0)).toEqual(['navy', 'collector']);
    expect(locked(3)).toEqual(['collector']);
    expect(locked(5)).toEqual([]);
  });

  it('flips the pass ink dark on light covers only', () => {
    expect(passInk('sun').light).toBe(true);
    expect(passInk('sun').ink).toBe(premium.modes.light.color.onAccent);
    expect(passInk('tangerine').light).toBe(false);
    expect(passInk('ink').ink).toBe(premium.modes.light.color.status.maybe.bg);
  });

  it('draws an unknown member colour neutral', () => {
    expect(memberAccent('blue/dashed')).toBe(premium.accent.sky);
    expect(memberAccent(null)).toBe(premium.accent.neutral);
  });
});
