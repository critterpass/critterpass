/**
 * The premium tab bar's images, drawn by `../../test-support/render-tab-icons.ts` from
 * `design/premium/Tabs.dc.html`. Tab icons are templates (the bar tints them); the guide images are
 * Tokek in colour.
 */
import type { ImageSourcePropType } from 'react-native';

import GUIDE_FAB from './guide-fab.png';
import GUIDE_TAB from './guide-tab.png';
import HOME from './home.png';
import PASS from './pass.png';
import TRIPS from './trips.png';
import WALLET from './wallet.png';

export type PremiumTabIcon = 'home' | 'trips' | 'wallet' | 'pass';

export const TAB_ICONS: Readonly<Record<PremiumTabIcon, ImageSourcePropType>> = {
  home: HOME,
  trips: TRIPS,
  wallet: WALLET,
  pass: PASS,
};

/** Tokek on 1.04's yellow disc, in the iOS search-role circle (48 pt). */
export const GUIDE_TAB_IMAGE: ImageSourcePropType = GUIDE_TAB;

/** Tokek inside the Android guide button (46 pt). */
export const GUIDE_FAB_IMAGE: ImageSourcePropType = GUIDE_FAB;
