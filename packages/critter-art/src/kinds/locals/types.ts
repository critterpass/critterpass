import type { OpSink } from '../../core/ops';
import type { CritterSpec } from '../../data/types';
import type { KindDrawOptions } from '../registry';

/** design's per-render colour triplet `C = {f, dk, bl}`, resolved from `o.fill/o.spot/o.belly` or `spec.c`. */
export interface ArchetypeColors {
  readonly f: string;
  readonly dk: string;
  readonly bl: string;
}

/** design/critters-draw-1/2.js archetype signature: `(d, o, s, C)`, one function per `spec.b`. */
export type ArchetypeFn = (
  sink: OpSink,
  options: KindDrawOptions,
  spec: CritterSpec,
  colors: ArchetypeColors,
) => void;

/**
 * design/critters-draw-1.js accessory anchor `a`: head-local position and head/neck geometry passed
 * to `X.acc`/`ACC[name]`. design leaves `hx`/`hy` (hand position) `undefined` for archetypes with no
 * hand-held props (wader, octo); every hand-held accessory (pizza/dice/berries/bamboo/acorn/gumleaf/
 * tulip/balloon) reads them unconditionally. Verified against design/critters-data.js: no wader or
 * octo critter selects a hand-held accessory, so `hx`/`hy` are required here and those two archetypes
 * pass an explicit, never-read placeholder instead of forcing every accessory to guard `undefined`.
 */
export interface AccessoryAnchor {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly cy: number;
  readonly ny: number;
  readonly nw: number;
  readonly hx: number;
  readonly hy: number;
}
