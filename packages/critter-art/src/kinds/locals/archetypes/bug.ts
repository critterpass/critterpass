import type { ArchetypeFn } from '../types';
import { drawBee, drawLadybug } from './bug-ladybug-bee';
import { drawCicada, drawHopper } from './bug-cicada-hopper';
import { drawDragonfly, drawScarab } from './bug-dragonfly-scarab';

/** design/critters-draw-2.js `A.bug`: 6 critters, one per named variant — no plain default (every bug spec sets `v`). */
export const bug: ArchetypeFn = (sink, options, spec, colors) => {
  if (spec.v === 'ladybug') {
    drawLadybug(sink, options, spec, colors);
  } else if (spec.v === 'bee') {
    drawBee(sink, options, colors);
  } else if (spec.v === 'cicada') {
    drawCicada(sink, options, colors);
  } else if (spec.v === 'hopper') {
    drawHopper(sink, options, colors);
  } else if (spec.v === 'dragonfly') {
    drawDragonfly(sink, options, colors);
  } else if (spec.v === 'scarab') {
    drawScarab(sink, options, colors);
  }
};
