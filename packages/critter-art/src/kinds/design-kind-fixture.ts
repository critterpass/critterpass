import { createOpBuilder } from '../core/ops';
import type { Op } from '../core/ops';
import type { KindDrawOptions, KindFn } from './registry';

// Test-only: drives a ported kind and the equivalent design kind through separate, identically
// seeded op builders so their op sequences can be compared directly for fidelity.
export interface BothOps {
  readonly ours: Op[];
  readonly design: Op[];
}

export function buildBothOps(
  ours: KindFn,
  design: KindFn,
  seed: number,
  ink: string,
  options: KindDrawOptions,
): BothOps {
  const oursBuilder = createOpBuilder(seed, ink);
  ours(oursBuilder.sink, options);
  const designBuilder = createOpBuilder(seed, ink);
  design(designBuilder.sink, options);
  return { ours: oursBuilder.ops, design: designBuilder.ops };
}

const INK = '#221e19';

/** Like `Partial<KindDrawOptions>`, but `pose` may be explicitly `undefined` for pose sweeps. */
export interface FixtureOverrides {
  readonly fill?: string;
  readonly accent?: string;
  readonly spot?: string;
  readonly belly?: string;
  readonly leaf?: string;
  readonly beak2?: string;
  readonly stripe?: string;
  readonly eye?: string;
  readonly pupil?: string;
  readonly pose?: string | undefined;
  readonly closed?: boolean;
}

export function fixtureOptions(overrides: FixtureOverrides = {}): KindDrawOptions {
  const { pose, ...rest } = overrides;
  return {
    ink: INK,
    eye: '#fffdf6',
    pupil: INK,
    closed: false,
    ...rest,
    ...(pose !== undefined ? { pose } : {}),
  };
}

/** Poses exercised across every guide/icon fidelity test: the full set the shared helpers branch on. */
export const ALL_POSES: ReadonlyArray<string | undefined> = [
  undefined,
  'idle',
  'wave',
  'cheer',
  'think',
  'point',
  'sleep',
  'crack',
];
