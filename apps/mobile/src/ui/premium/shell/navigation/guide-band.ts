import { createContext, useContext } from 'react';
import { Platform } from 'react-native';

import { SHELL_SIZE } from '../shell-theme';

/**
 * The band at the foot of a tab's pages that Android's guide button floats in, above the Material
 * bar. Root pages end above it so no row's trailing edge (amounts, chevrons, actions) sits under
 * the button. Zero outside the tabs (a page pushed over them has no button) and on iOS, whose guide
 * circle sits in the tab bar.
 */
export const GUIDE_BAND =
  Platform.OS === 'android' ? SHELL_SIZE.guideCircle + SHELL_SIZE.androidFabMargin * 2 : 0;

export const GuideBandContext = createContext(0);

export function useGuideBand(): number {
  return useContext(GuideBandContext);
}
