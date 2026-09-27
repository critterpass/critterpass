import { createOpBuilder } from '../../core/ops';
import type { Op, OpSink } from '../../core/ops';
import type { KindDrawOptions } from '../registry';
import type { DesignCritterFn } from './design-critter-reference';
import type { CritterSpec } from '../../data/types';

// Test-only: compares a ported draw function against its unmodified design equivalent by op
// sequence. Works for archetypes (d, o, s, C), accessories (d, a, s, C), ears/horns (d, t, H, C, s,
// ph?) and every other X.h part function — they all take a sink first and are otherwise driven with
// the same extra arguments on both sides, so one generic comparator covers all of them.

export interface BothOps {
  readonly ours: Op[];
  readonly design: Op[];
}

/** Narrows an `X.h`/`X.A`/`X.ACC` lookup (typed `unknown` since `X` mirrors loosely-typed JS) to a callable design function, or fails with a clear message if the design source no longer exports it. */
export function asDesignFn(value: unknown, label: string): DesignCritterFn {
  if (typeof value !== 'function') {
    throw new Error(`design source no longer exports ${label}; update the fixture`);
  }
  return value as DesignCritterFn;
}

/**
 * Wraps a design lookup table (`MASK`, `MUZ`, `PAT`) — never exposed on `X`, only reachable via
 * `evaluateDesignCritterBlock` — as a `DesignCritterFn` that dispatches on its first rest argument,
 * mirroring the design's own `TABLE[key](d, ...)` call sites so it plugs into `buildBothCritterOps`.
 */
export function designTableDispatcher(
  table: Readonly<Record<string, DesignCritterFn>>,
): DesignCritterFn {
  return (sink, ...rest) => {
    const [key, ...args] = rest;
    const fn = typeof key === 'string' ? table[key] : undefined;
    fn?.(sink, ...args);
  };
}

export function buildBothCritterOps<Args extends readonly unknown[]>(
  ours: (sink: OpSink, ...rest: Args) => void,
  design: DesignCritterFn,
  seed: number,
  ink: string,
  ...rest: Args
): BothOps {
  const oursBuilder = createOpBuilder(seed, ink);
  ours(oursBuilder.sink, ...rest);
  const designBuilder = createOpBuilder(seed, ink);
  design(designBuilder.sink, ...rest);
  return { ours: oursBuilder.ops, design: designBuilder.ops };
}

const INK = '#221e19';

/** Like `Partial<KindDrawOptions>`, but `pose` may be explicitly `undefined` for pose sweeps. */
export interface FixtureOptionOverrides {
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

export function fixtureOptions(overrides: FixtureOptionOverrides = {}): KindDrawOptions {
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

/** A minimal sit/stand-shaped spec for tests: `b`/`c` plus whatever fields the test overrides. */
export function fixtureSpec(overrides: Partial<CritterSpec> & Pick<CritterSpec, 'b'>): CritterSpec {
  return { c: ['#dba06a', '#8f5a3a', '#f4d9b0'], ...overrides };
}
