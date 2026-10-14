/**
 * Whether the current screen shows as a native sheet, and the insets its own layout should keep.
 * A screen built edge to edge (a pass, a phrase card, the camera) sits under the status bar as a
 * full-screen cover, but in a tall sheet its top is the sheet's top edge, under the grabber: the
 * window's status-bar inset there would push its ✕ and content far down.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';

import { useScreenPlacement } from './use-screen-placement';

export { SHEET_TOP_CLEARANCE } from './presented-insets';

/**
 * True when the screen shows as a native sheet: its own stack or its group (iOS) presented it as
 * one. The first screen of a group presented as a sheet rises as a page on Android (the native
 * sheet can't hold a stack). Outside a navigator (tests, the gallery) it is a sheet.
 */
export function useShownAsSheet(): boolean {
  const placement = useScreenPlacement();
  if (placement === undefined) return true;
  if (placement.kind !== 'presented' || placement.presentation.kind !== 'sheet') return false;
  return placement.ownStack || Platform.OS === 'ios';
}

/**
 * The safe-area insets for a screen's own layout. Inside a sheet the navigator that presented it
 * already gives the grabber's band as the top (`presentedScreenLayout`), so these are the
 * safe-area context's own; the name stays for screens that read it.
 */
export function useScreenInsets(): EdgeInsets {
  return useSafeAreaInsets();
}
