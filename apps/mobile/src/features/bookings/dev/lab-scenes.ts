/** Every bookings lab scene by name, for the (dev) bookings lab and its screenshot flows. */
import type { ReactNode } from 'react';

import { WALLET_SCENES } from './lab-scenes-wallet';

export const BOOKINGS_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...WALLET_SCENES,
};

export const BOOKINGS_LAB_SCENE_NAMES: readonly string[] = Object.keys(BOOKINGS_LAB_SCENES);
