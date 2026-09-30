/** Every guide lab scene by name, for the (dev) guide lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { CREW_SCENES } from '../../crew-mention/dev/lab-scenes-crew';
import { METER_SCENES } from '../../meter/dev/lab-scenes-meter';
import { PHRASE_SCENES } from '../../phrases/dev/lab-scenes-phrases';
import { CHAT_SCENES } from './lab-scenes-chat';

export const GUIDE_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...CHAT_SCENES,
  ...METER_SCENES,
  ...CREW_SCENES,
  ...PHRASE_SCENES,
};

export const GUIDE_LAB_SCENE_NAMES: readonly string[] = Object.keys(GUIDE_LAB_SCENES);
