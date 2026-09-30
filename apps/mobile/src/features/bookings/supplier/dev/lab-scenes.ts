/**
 * Every supplier lab scene by name, for the (dev) supplier lab and its screenshot flows, in the
 * order the flows visit them (they scroll the list downwards only).
 */
import type { ReactNode } from 'react';

import { AROUND_SCENES } from './lab-scenes-around';
import { OFFER_SCENES } from './lab-scenes-offers';
import { VENDOR_SCENES } from './lab-scenes-vendor';

export const SUPPLIER_LAB_SCENES: Readonly<Record<string, () => ReactNode>> = {
  ...AROUND_SCENES,
  ...OFFER_SCENES,
  ...VENDOR_SCENES,
};

export const SUPPLIER_LAB_SCENE_NAMES: readonly string[] = Object.keys(SUPPLIER_LAB_SCENES);
