import { critters } from '../../data/critters';
import { isGuideSpec } from '../../data/types';
import type { ArchetypeName, CritterSpec } from '../../data/types';
import { DEFAULT_VIEW_BOX, hasKind, registerKind, resolveKind } from '../registry';
import type { KindFn } from '../registry';
import { bird } from './archetypes/bird';
import { bug } from './archetypes/bug';
import { crab } from './archetypes/crab';
import { fish } from './archetypes/fish';
import { frog } from './archetypes/frog';
import { lizard } from './archetypes/lizard';
import { nessie } from './archetypes/nessie';
import { octo } from './archetypes/octo';
import { seal } from './archetypes/seal';
import { sit } from './archetypes/sit';
import { snake } from './archetypes/snake';
import { stand } from './archetypes/stand';
import { turtle } from './archetypes/turtle';
import { wader } from './archetypes/wader';
import { whale } from './archetypes/whale';
import type { ArchetypeFn } from './types';

/** All 15 design/critters-draw-1/2.js archetypes. */
const ARCHETYPES: Readonly<Record<ArchetypeName, ArchetypeFn>> = {
  sit,
  stand,
  bird,
  wader,
  fish,
  lizard,
  frog,
  turtle,
  snake,
  bug,
  octo,
  crab,
  seal,
  whale,
  nessie,
};

/** design's boot(): `C = {f: o.fill||s.c[0], dk: o.spot||s.c[1], bl: o.belly||s.c[2]}`, wrapped once per critter around its archetype function. */
function wrapArchetype(fn: ArchetypeFn, spec: CritterSpec): KindFn {
  return (sink, options) => {
    const colors = {
      f: options.fill || spec.c[0],
      dk: options.spot || spec.c[1],
      bl: options.belly || spec.c[2],
    };
    fn(sink, options, spec, colors);
  };
}

/**
 * design's `boot()`: registers one kind per CritterDex entry. Locals get their own `cp-###`
 * registration (blink-enabled, matching `CREATURES[c.id] = 1`); guides are registered under their
 * `cp-###` id as an alias of their already-registered hand-drawn kind (design's own `kind = spec.k
 * || id`, so `resolveKind('cp-112')` renders gecko) — the design quirk of guides never rendering
 * under their cp-id (`kind="cp-112"` falls back to `spark`) is a design-source bug, not behaviour to
 * preserve, and the phase's own done-when calls for the fix (`resolveKind('cp-112')` renders gecko).
 */
export function registerLocalKinds(): void {
  for (const critter of critters) {
    if (isGuideSpec(critter.spec)) {
      if (!hasKind(critter.kind)) continue;
      registerKind(critter.id, resolveKind(critter.kind));
      continue;
    }
    registerKind(critter.id, {
      fn: wrapArchetype(ARCHETYPES[critter.spec.b], critter.spec),
      viewBox: DEFAULT_VIEW_BOX,
      animates: true,
    });
  }
}
