import { tokens } from '@cp/design-tokens';

import { sizeToken } from '../theme';

/**
 * `size.tabbar` (88) is measured on the 390 × 844 reference frame and includes its 34 pt home
 * indicator; the bar keeps the remaining design height above whatever inset the device reports
 * (gesture or 3-button navigation on Android, home indicator on iOS).
 */
const REFERENCE_BOTTOM_INSET = 34;
export const TAB_BAR_CONTENT_HEIGHT = tokens.size.tabbar - REFERENCE_BOTTOM_INSET;

/** Negative: how far the FAB rises above the tab bar's top edge. */
export const FAB_RAISE = sizeToken(tokens.size.fab, 'raisedOffset');

/**
 * Height above the device's bottom inset that the floating tab bar covers, the FAB's raised band
 * included: a fixed footer inside a tab stack sits above it so the FAB never overlaps its button.
 */
export const TAB_BAR_CLEARANCE = TAB_BAR_CONTENT_HEIGHT - FAB_RAISE;
