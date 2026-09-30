/**
 * Every bookings lab scene by name, for the (dev) bookings lab and its screenshot flows, in the
 * order the flows visit them (they scroll the list downwards only).
 */
import type { ReactNode } from 'react';

import { ADD_SCENES } from './lab-scenes-add';
import { INSURANCE_SCENES } from './lab-scenes-insurance';
import { WALLET_SCENES } from './lab-scenes-wallet';

export const BOOKINGS_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...WALLET_SCENES,
  ...INSURANCE_SCENES,
  ...ADD_SCENES,
};

export const BOOKINGS_LAB_SCENE_NAMES: readonly string[] = Object.keys(BOOKINGS_LAB_SCENES);
