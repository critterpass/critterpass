/** Every critters lab scene by name, for the (dev) critters lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { DETAIL_SCENES } from './detail-scenes';
import { DEX_SCENES } from './dex-scenes';
import { ENCOUNTER_SCENES } from './encounter-scenes';
import { LEGENDARY_SCENES } from './legendary-scenes';
import { WHERE_SCENES } from './where-scenes';
import { QUEST_SCENES } from '../quests/dev/quest-scenes';

export const CRITTER_SCENES: Readonly<Record<string, () => ReactNode>> = {
  // Listed first: the lab is long, and a scroll to its end can run out of time on iOS.
  ...WHERE_SCENES,
  ...DEX_SCENES,
  ...DETAIL_SCENES,
  ...ENCOUNTER_SCENES,
  ...LEGENDARY_SCENES,
  ...QUEST_SCENES,
};

export const CRITTER_SCENE_NAMES: readonly string[] = Object.keys(CRITTER_SCENES);
