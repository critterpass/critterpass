import type { OpSink } from '../../../core/ops';
import type { CritterSpec } from '../../../data/types';
import type { AccessoryAnchor, ArchetypeColors } from '../types';

/**
 * design/critters-draw-1.js `ACC[name]`: signature is `(d, a, s, C)`, though in practice every
 * accessory reads at most the anchor and `spec.sc` (the `scarf` colour override) — none read
 * `colors`, so implementations only declare the parameters they use, matching the design source.
 */
export type AccessoryFn = (
  sink: OpSink,
  anchor: AccessoryAnchor,
  spec: Pick<CritterSpec, 'sc'>,
  colors: ArchetypeColors,
) => void;
