import { afterEach, describe, expect, it, vi } from 'vitest';

import { hasKind, resolveKind } from './registry';

const GUIDES = ['gecko', 'tanuki', 'puffin', 'axolotl', 'sardine', 'alpaca', 'langur'];
const ANNOTATION_ICONS: Record<string, readonly [number, number]> = {
  underline: [100, 14],
  circle: [100, 50],
  arrow: [100, 40],
  squiggle: [100, 20],
};
const PLAIN_ICONS = [
  'egg',
  'star',
  'flame',
  'lock',
  'chat',
  'cal',
  'pin',
  'bed',
  'ticket',
  'boat',
  'wallet',
  'bell',
  'sun',
  'rain',
  'spark',
  'plane',
  'car',
  'volcano',
  'wave',
  'temple',
  'camera',
  'food',
  'check',
  'heart',
];

describe('resolveKind', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('registers all 7 guides that animate (blink support)', () => {
    for (const name of GUIDES) {
      expect(hasKind(name)).toBe(true);
      expect(resolveKind(name).animates).toBe(true);
      expect(resolveKind(name).viewBox).toEqual([100, 100]);
    }
  });

  it('registers all 28 icon kinds, non-animating, with their design view boxes', () => {
    for (const name of PLAIN_ICONS) {
      expect(resolveKind(name).animates).toBe(false);
      expect(resolveKind(name).viewBox).toEqual([100, 100]);
    }
    for (const [name, viewBox] of Object.entries(ANNOTATION_ICONS)) {
      expect(resolveKind(name).animates).toBe(false);
      expect(resolveKind(name).viewBox).toEqual(viewBox);
    }
    expect(GUIDES.length + PLAIN_ICONS.length + Object.keys(ANNOTATION_ICONS).length).toBe(35);
  });

  it('throws outside production for an unknown kind', () => {
    expect(() => resolveKind('not-a-real-kind')).toThrow(/unknown critter-art kind/);
  });

  it('falls back to spark and logs in production instead of throwing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = resolveKind('not-a-real-kind');
    expect(result).toBe(resolveKind('spark'));
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
