/**
 * What decorates each this-or-that card (3a-4): a corner doodle and Tokek's pose. The mornings
 * pair is the designed one (a sun over "Sunrise summit", a sleeping Tokek with its "z" under
 * "Sleep till ten"); the other pairs follow the same idea with the existing doodles and poses.
 */
import type { Pose } from '@cp/critter-art';

import type { DoodleName } from '@/ui/icons/generated';

export interface CardArt {
  readonly doodle: DoodleName | null;
  readonly pose: Pose;
}

type PairArt = Readonly<Record<'left' | 'right', CardArt>>;

const art = (doodle: DoodleName | null, pose: Pose): CardArt => ({ doodle, pose });

const PAIRS: Readonly<Record<string, PairArt>> = {
  food: { left: art('food', 'wave'), right: art('star', 'idle') },
  pace: { left: art('plane', 'cheer'), right: art('pin', 'idle') },
  mornings: { left: art('sun', 'cheer'), right: art(null, 'sleep') },
  evenings: { left: art('spark', 'cheer'), right: art('bed', 'sleep') },
  'nature-vs-city': { left: art('rain', 'point'), right: art('spark', 'wave') },
  spending: { left: art('star', 'cheer'), right: art('wallet', 'think') },
};

/** A question the app does not know yet (a newer quiz release) still gets a lively Tokek. */
const FALLBACK: PairArt = { left: art(null, 'cheer'), right: art(null, 'idle') };

export function cardArt(questionId: string, side: 'left' | 'right'): CardArt {
  return (PAIRS[questionId] ?? FALLBACK)[side];
}
