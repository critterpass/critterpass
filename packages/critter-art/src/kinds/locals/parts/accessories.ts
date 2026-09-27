import * as headwear from './accessories-headwear';
import * as neckwear from './accessories-neckwear';
import * as natureAndProps from './accessories-nature-and-props';
import type { AccessoryFn } from './accessories-types';
import type { OpSink } from '../../../core/ops';
import type { CritterSpec } from '../../../data/types';
import type { AccessoryAnchor, ArchetypeColors } from '../types';

export type { AccessoryFn } from './accessories-types';

/** design/critters-draw-1.js `ACC`: 33 accessories across headwear, neckwear and botanical/hand-held props (`X.ACC`). */
export const ACC: Readonly<Record<string, AccessoryFn>> = {
  ...headwear,
  ...neckwear,
  ...natureAndProps,
};

/** design/critters-draw-1.js `X.acc`: dispatches on `spec.acc`, re-ordering args to the accessory's own `(d, a, s, C)`. */
export function drawAccessory(
  sink: OpSink,
  spec: Pick<CritterSpec, 'acc' | 'sc'>,
  colors: ArchetypeColors,
  anchor: AccessoryAnchor,
): void {
  const fn = spec.acc !== undefined ? ACC[spec.acc] : undefined;
  fn?.(sink, anchor, spec, colors);
}
